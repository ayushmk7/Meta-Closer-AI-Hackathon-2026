"""The scripted planner (PRD-2 §3.5): Muse's default step sequence, which is also the fallback when Muse is down.

`ScriptedRun` is pure: it holds one meetup's steps and yields events; the caller persists each one, emits
`meetup.step` / `approval.requested`, and sleeps `demo.stepDelayS` between steps. Event types:

  {"type": "step", "step": MuseStep + {"forUserId"?}}   append or update (by stepId)
  {"type": "approval", "approval": Approval + {"userId"}}
  {"type": "payment", "userId", "myPayment"}            paid | pay_at_venue | declined
  {"type": "release", "userId"}                          seat freed after a declined payment with no fallback
  {"type": "booking", "booking": Booking}
  {"type": "reschedule", "startsAt", "endsAt"}
  {"type": "calendar", "desired": "event"}               write every attendee's directive
  {"type": "confirmed", "eventLabel"}                    meetup -> confirmed
  {"type": "cancelled", "reason"}                        meetup -> cancelled; caller posts alternatives in the thread

Steps with `forUserId` (payments) are shown only to that user: nobody learns who declined (P6). P11 is enforced
here: `book` never runs while any prepaid attendee is undecided, and no payment completes without an approval or
an amount within that user's auto-spend limit.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from cg_api.muse.copy import SEAT, approval_copy, clock, day, local, money
from cg_api.providers import simulated_book

PROVIDER = "Simulated booking"


def _iso(t: datetime) -> str:
    return t.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _dt(iso: str) -> datetime:
    return datetime.fromisoformat(iso)


@dataclass
class ScriptedRun:
    meetup_id: str
    plan: dict  # PlanCard-like: activityType, startsAt, endsAt, cost {kind, perPersonCents, currency}
    venue: dict  # seed venue record (booking, capacityPerSlot, payAtVenueAllowed)
    attendees: list[dict]  # [{userId, firstName, spendWithoutAskingCents}]
    now: str
    new_id: Callable[[str], str]
    reschedule_window_min: int = 120
    approval_expires_hours: int = 12
    fail_next_booking: bool = False
    steps: list[dict] = field(default_factory=list)
    pending: dict[str, str] = field(default_factory=dict)  # approvalId -> userId
    decided: dict[str, str] = field(default_factory=dict)  # userId -> paid | pay_at_venue | declined
    booking_started: bool = False

    # ---------- helpers ----------
    def _step(self, kind: str, status: str, label: str, detail=None, approval_id=None, for_user=None) -> dict:
        s = {
            "stepId": self.new_id("st"),
            "kind": kind,
            "status": status,
            "label": label,
            "detail": detail,
            "approvalId": approval_id,
            "at": self.now,
        }
        if for_user:
            s["forUserId"] = for_user
        self.steps.append(s)
        return {"type": "step", "step": dict(s)}

    def _update(self, step: dict, **kw) -> dict:
        step.update(kw, at=self.now)
        return {"type": "step", "step": dict(step)}

    def _find(self, kind: str, for_user: str | None = None) -> dict | None:
        return next((s for s in reversed(self.steps) if s["kind"] == kind and s.get("forUserId") == for_user), None)

    @property
    def prepaid(self) -> bool:
        return (self.plan.get("cost") or {}).get("kind") == "prepaid"

    @property
    def needs_booking(self) -> bool:
        return (self.venue.get("booking") or {}).get("kind", "none") != "none"

    def _party(self) -> int:
        return sum(1 for a in self.attendees if self.decided.get(a["userId"]) != "declined" or not self.prepaid)

    def _seat(self, n: int) -> str:
        noun = SEAT.get(self.plan.get("activityType", ""), "spot")
        return f"{n} {noun}s" if n != 1 else f"1 {noun}"

    # ---------- the sequence ----------
    def start(self) -> Iterator[dict]:
        p, v, n = self.plan, self.venue, len(self.attendees)
        yield self._step("group_chat", "done", "Opened your group chat")
        yield self._step(
            "find_time",
            "done",
            f"Everyone's free {day(p['startsAt'])} {clock(p['startsAt'])} to {clock(p['endsAt'])}",
            detail=f"Checked {n} calendars",
        )
        if self.needs_booking:
            if simulated_book(v, p["startsAt"], n) is None:  # capacity check only; nothing is booked yet
                yield self._step("check_availability", "failed", f"{v['name']} is full at {clock(p['startsAt'], True)}")
                if not (yield from self._shift(n, "No room")):
                    return
            yield self._step(
                "check_availability", "done", f"{v['name']} has {self._seat(n)} open at {clock(self.plan['startsAt'])}"
            )
        else:
            yield self._step("check_availability", "done", f"No booking needed at {v['name']}")
        if self.prepaid:
            yield from self._payments()
        yield from self._maybe_book()

    def _payments(self) -> Iterator[dict]:
        cost = self.plan["cost"]
        cents, amount = cost["perPersonCents"], money(cost["perPersonCents"])
        copy = approval_copy(self.plan, self.venue)
        start = _dt(self.plan["startsAt"])
        expires = min(_dt(self.now) + timedelta(hours=self.approval_expires_hours), start - timedelta(hours=2))
        for a in self.attendees:
            uid = a["userId"]
            if cents <= a.get("spendWithoutAskingCents", 0):
                self.decided[uid] = "paid"
                yield self._step("payment", "done", f"Paid {amount} (within your auto-spend limit)", for_user=uid)
                yield {"type": "payment", "userId": uid, "myPayment": "paid"}
                continue
            ap_id = self.new_id("ap")
            self.pending[ap_id] = uid
            yield {
                "type": "approval",
                "approval": {
                    "approvalId": ap_id,
                    "meetupId": self.meetup_id,
                    "kind": "payment",
                    "status": "pending",
                    **copy,
                    "amountCents": cents,
                    "currency": cost["currency"],
                    "payee": self.venue["name"],
                    "simulated": True,
                    "expiresAt": _iso(expires),
                    "userId": uid,
                },
            }
            yield self._step("payment", "needs_you", f"Waiting for you to OK {amount}", approval_id=ap_id, for_user=uid)
        if self.pending:
            # only the next step is queued: anything after a booking failure must append after it, in order
            yield self._step("book", "queued", f"Book {self._seat(len(self.attendees))}")

    def decide(self, approval_id: str, status: str) -> Iterator[dict]:
        """approved | declined | expired for one pending payment approval; continues the run when all are in."""
        uid = self.pending.pop(approval_id, None)
        if uid is None:
            return
        step = self._find("payment", uid)
        amount = money(self.plan["cost"]["perPersonCents"])
        if status == "approved":
            self.decided[uid] = "paid"
            yield self._update(step, status="done", label=f"Paid {amount}")
            yield {"type": "payment", "userId": uid, "myPayment": "paid"}
        elif (self.venue.get("booking") or {}).get("payAtVenueAllowed"):
            self.decided[uid] = "pay_at_venue"
            noun = SEAT.get(self.plan.get("activityType", ""), "spot")
            yield self._update(
                step, status="done", label=f"{self.venue['name']} will hold your {noun}; you'll pay there"
            )
            yield {"type": "payment", "userId": uid, "myPayment": "pay_at_venue"}
        else:
            # ponytail: free-venue `change` approval and backfill land with the M2 tool agent; M1 releases the seat
            self.decided[uid] = "declined"
            yield self._update(step, status="skipped", label="You're not booked for this one")
            yield {"type": "payment", "userId": uid, "myPayment": "declined"}
            yield {"type": "release", "userId": uid}
        yield from self._maybe_book()

    def _maybe_book(self) -> Iterator[dict]:
        if self.pending or self.booking_started:  # P11: never book while undecided; book at most once
            return
        self.booking_started = True  # set before the first yield: interleaved decide() generators can't both book
        p, v = self.plan, self.venue
        party = self._party()
        if not self.needs_booking:
            yield self._booking("not_needed", "No booking needed", None)
            yield from self._finish()
            return
        code = simulated_book(v, p["startsAt"], party, fail=self.fail_next_booking)
        if code is None:
            self.fail_next_booking = False
            yield self._event_or_new(
                self._find("book"),
                "book",
                status="failed",
                label=f"{v['name']} is full at {clock(p['startsAt'], True)}",
            )
            if not (yield from self._shift(party, "Full")):
                return
            code = simulated_book(v, self.plan["startsAt"], party)
            if code is None:
                yield self._step("book", "failed", f"{v['name']} is full at {clock(self.plan['startsAt'], True)} too")
                yield self._booking("failed", "Couldn't book it", None)
                yield from self._cancel()
                return
        yield self._event_or_new(
            self._find("book"),
            "book",
            status="done",
            label=f"Booked {self._seat(party)} at {v['name']}",
            detail=f"Confirmation {code}",
        )
        yield self._booking("booked", f"Booked · {code}", code)
        yield from self._finish()

    def _booking(self, status: str, label: str, code: str | None) -> dict:
        return {
            "type": "booking",
            "booking": {"status": status, "label": label, "provider": PROVIDER, "confirmationCode": code},
        }

    def _event_or_new(self, step, kind, **kw) -> dict:
        if step and step["status"] == "queued":
            return self._update(step, **kw)
        return self._step(kind, kw.pop("status"), kw.pop("label"), **kw)

    def _shift(self, party: int, why: str):
        """Move the start 1 h later inside the autonomy bounds if the venue has room then. Returns success."""
        p, v = self.plan, self.venue
        shift = timedelta(minutes=60)
        later = _iso(_dt(p["startsAt"]) + shift)
        if shift > timedelta(minutes=self.reschedule_window_min) or simulated_book(v, later, party) is None:
            yield self._step("reschedule", "failed", f"Couldn't find another time at {v['name']} today")
            yield self._booking("failed", "Couldn't book it", None)
            yield from self._cancel()
            return False
        old = clock(p["startsAt"])
        self.plan = {**p, "startsAt": later, "endsAt": _iso(_dt(p["endsAt"]) + shift)}
        yield self._step(
            "reschedule", "done", f"{why} at {old}, so I moved it to {clock(later)}; everyone's still free"
        )
        yield {"type": "reschedule", "startsAt": self.plan["startsAt"], "endsAt": self.plan["endsAt"]}
        return True

    def _cancel(self) -> Iterator[dict]:
        """Never leave a stuck timeline (D4): refund anyone paid, cancel, and let the caller post alternatives."""
        # ponytail: a `change` approval offering other times replaces this with the M2 tool agent
        amount = money((self.plan.get("cost") or {}).get("perPersonCents", 0))
        for uid, how in self.decided.items():
            if how == "paid":
                yield self._step("refund", "done", f"Refunded your {amount}", for_user=uid)
                yield {"type": "payment", "userId": uid, "myPayment": "not_needed"}  # nothing owed after the refund
        reason = f"I couldn't find a time that works at {self.venue['name']}, so I cancelled this one."
        yield self._step("cancel", "done", f"{reason} Similar plans are in the chat.")
        yield {"type": "cancelled", "reason": reason}

    def _finish(self) -> Iterator[dict]:
        # ponytail: done on write; "done when every attendee applied it" needs syncCalendar acks from slice A (M2)
        yield self._step("calendar", "done", "Added it to everyone's calendar")
        yield {"type": "calendar", "desired": "event"}
        going = len(self.attendees) - sum(1 for s in self.decided.values() if s == "declined")
        yield self._step("event", "done", f"Created a private event · {going} going")
        yield {"type": "confirmed", "eventLabel": f"Private event · {going} going"}
        yield self._step("reminder", "done", "Set leave-by reminders for everyone")

    def reschedule_to(self, new_start: str, busy: dict[str, list[dict]]) -> tuple[list[dict], str, list[str]]:
        """(events, reply, stepIds) for a chat request to move the start. Applies only inside the autonomy bounds
        (CONTRACTS §5): same local day, within rescheduleWindowMin, every attendee free, venue has room, cost unchanged."""
        p, v = self.plan, self.venue
        old, new = _dt(p["startsAt"]), _dt(new_start)
        end = new + (_dt(p["endsAt"]) - old)
        party = self._party()
        if new == old:
            return [], f"It's already at {clock(new_start)}.", []
        in_bounds = (
            local(new_start).date() == local(p["startsAt"]).date()
            and abs(new - old) <= timedelta(minutes=self.reschedule_window_min)
            and all(_free(busy.get(a["userId"], []), new, end) for a in self.attendees)
            and (not self.needs_booking or simulated_book(v, new_start, party) is not None)
        )
        if not in_bounds:
            # ponytail: a `change` approval to every attendee lands with the M2 tool agent
            return (
                [],
                (
                    f"I can't move it to {clock(new_start, True)} on my own. I can shift it by up to "
                    f"{self.reschedule_window_min // 60} hours on the same day when everyone's free and there's room."
                ),
                [],
            )
        n0 = len(self.steps)
        old_label = clock(p["startsAt"])
        self.plan = {**p, "startsAt": new_start, "endsAt": _iso(end)}
        events = [
            self._step("reschedule", "done", f"Moved it from {old_label} to {clock(new_start)}; everyone's still free")
        ]
        events.append({"type": "reschedule", "startsAt": new_start, "endsAt": self.plan["endsAt"]})
        booked = any(s["kind"] == "book" and s["status"] == "done" for s in self.steps)
        if self.needs_booking and booked:
            code = simulated_book(v, new_start, party)
            events.append(
                self._step(
                    "book", "done", f"Rebooked {self._seat(party)} at {v['name']}", detail=f"Confirmation {code}"
                )
            )
            events.append(self._booking("booked", f"Booked · {code}", code))
        events.append(self._step("calendar", "done", "Updated everyone's calendar"))
        events.append({"type": "calendar", "desired": "event"})
        room = f" and {v['name']} has room then" if self.needs_booking else ""
        reply = f"Done. Everyone's free at {clock(new_start)}{room}, so I moved it. Your calendars are updated."
        return events, reply, [s["stepId"] for s in self.steps[n0:]]


def visible_steps(steps: list[dict], viewer_id: str) -> list[dict]:
    """What one attendee sees: shared steps plus only their own payment step, without the internal field."""
    return [{k: v for k, v in s.items() if k != "forUserId"} for s in steps if s.get("forUserId") in (None, viewer_id)]


# ---------- Muse in the group chat (toMuse): the scripted D4 path ----------
_TIME = re.compile(r"\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?=\W|$)", re.IGNORECASE)
_SHIFT = re.compile(r"\b(an|one|1|half an|30 min(?:utes)?)\s*(hour)?\s*(later|earlier)\b", re.IGNORECASE)


def parse_time_change(text: str, current_start: str) -> str | None:
    """New start (UTC ISO) for "11", "11am", "11:30", "noon", "an hour later"; same local day. None if no time.
    A bare hour picks the am/pm reading closest to the current start."""
    cur = local(current_start)
    t = text.lower()
    m = _SHIFT.search(t)
    if m:
        mins = 30 if m[1].startswith(("half", "30")) else 60
        return _iso(_dt(current_start) + timedelta(minutes=mins if m[3] == "later" else -mins))
    if re.search(r"\bnoon\b", t):
        h, mi = 12, 0
    else:
        hit = next(
            (
                x
                for x in _TIME.finditer(t)
                if x[1] and int(x[1]) <= 23 and not re.match(r"\s*(people|wheels?|of us)", t[x.end() :])
            ),
            None,
        )
        if not hit:
            return None
        h, mi, ampm = int(hit[1]), int(hit[2] or 0), (hit[3] or "").replace(".", "")
        if ampm == "pm" and h < 12:
            h += 12
        elif ampm == "am" and h == 12:
            h = 0
        elif not ampm and h <= 12:
            alts = [h % 12, h % 12 + 12]
            h = min(alts, key=lambda x: abs(x * 60 + mi - (cur.hour * 60 + cur.minute)))
    if h > 23 or mi > 59:
        return None
    return _iso(cur.replace(hour=h, minute=mi))


def answer_question(plan: dict, venue: dict) -> str:
    when = f"{day(plan['startsAt'])} {clock(plan['startsAt'], True)} to {clock(plan['endsAt'], True)}"
    cost = (plan.get("cost") or {}).get("perPersonCents", 0)
    money_line = f" It's {money(cost)} each." if cost else " It's free."
    return f"It's {when} at {venue['name']}.{money_line} I'm handling the booking and the calendar."


def _free(busy: list[dict], start: datetime, end: datetime) -> bool:
    return not any(_dt(b["start"]) < end and _dt(b["end"]) > start for b in busy)
