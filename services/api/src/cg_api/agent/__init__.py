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

Steps with `forUserId` (payments) are shown only to that user: nobody learns who declined (P6). P11 is enforced
here: `book` never runs while any prepaid attendee is undecided, and no payment completes without an approval or
an amount within that user's auto-spend limit.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from cg_api.muse.copy import SEAT, approval_copy, clock, day, money
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
        if self.pending:  # P11: never book while a prepaid attendee is undecided
            return
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
                return  # ponytail: cancel with alternatives or a `change` approval lands with the M2 tool agent
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
            return False  # ponytail: outside the bounds needs a `change` approval (M2)
        old = clock(p["startsAt"])
        self.plan = {**p, "startsAt": later, "endsAt": _iso(_dt(p["endsAt"]) + shift)}
        yield self._step(
            "reschedule", "done", f"{why} at {old}, so I moved it to {clock(later)}; everyone's still free"
        )
        yield {"type": "reschedule", "startsAt": self.plan["startsAt"], "endsAt": self.plan["endsAt"]}
        return True

    def _finish(self) -> Iterator[dict]:
        # ponytail: done on write; "done when every attendee applied it" needs syncCalendar acks from slice A (M2)
        yield self._step("calendar", "done", "Added it to everyone's calendar")
        yield {"type": "calendar", "desired": "event"}
        going = len(self.attendees) - sum(1 for s in self.decided.values() if s == "declined")
        yield self._step("event", "done", f"Created a private event · {going} going")
        yield {"type": "confirmed", "eventLabel": f"Private event · {going} going"}
        yield self._step("reminder", "done", "Set leave-by reminders for everyone")


def visible_steps(steps: list[dict], viewer_id: str) -> list[dict]:
    """What one attendee sees: shared steps plus only their own payment step, without the internal field."""
    return [{k: v for k, v in s.items() if k != "forUserId"} for s in steps if s.get("forUserId") in (None, viewer_id)]
