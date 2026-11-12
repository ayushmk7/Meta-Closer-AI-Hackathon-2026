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
            cap = (v.get("booking") or {}).get("capacityPerSlot", n)
            ok = cap >= n
            yield self._step(
                "check_availability",
                "done" if ok else "failed",
                f"{v['name']} has {self._seat(n)} open at {clock(p['startsAt'])}"
                if ok
                else f"{v['name']} doesn't have room for {n} at {clock(p['startsAt'])}",
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
            # queued steps show what comes next while Muse waits
            yield self._step("book", "queued", f"Book {self._seat(len(self.attendees))}")
            yield self._step("calendar", "queued", "Add it to everyone's calendar")
            yield self._step("event", "queued", "Create a private event")
            yield self._step("reminder", "queued", "Remind everyone when to leave")

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
        book = self._find("book")
        if self.needs_booking:
            code = simulated_book(v, p["startsAt"], party, fail=self.fail_next_booking)
            if code is None:
                self.fail_next_booking = False
                yield self._event_or_new(
                    book, "book", status="failed", label=f"Couldn't book {clock(p['startsAt'])}: {v['name']} is full"
                )
                yield from self._retry_later(party)
                return
            yield self._event_or_new(
                book,
                "book",
                status="done",
                label=f"Booked {self._seat(party)} at {v['name']}",
                detail=f"Confirmation {code}",
            )
            yield {
                "type": "booking",
                "booking": {
                    "status": "booked",
                    "label": f"Booked · {code}",
                    "provider": PROVIDER,
                    "confirmationCode": code,
                },
            }
        else:
            yield {
                "type": "booking",
                "booking": {
                    "status": "not_needed",
                    "label": "No booking needed",
                    "provider": PROVIDER,
                    "confirmationCode": None,
                },
            }
        yield from self._finish()

    def _event_or_new(self, step, kind, **kw) -> dict:
        if step and step["status"] == "queued":
            return self._update(step, **kw)
        return self._step(kind, kw.pop("status"), kw.pop("label"), **kw)

    def _retry_later(self, party: int) -> Iterator[dict]:
        """Booking failure stays visible, then Muse moves the start by 1 h inside the autonomy bounds."""
        p, v = self.plan, self.venue
        shift = timedelta(minutes=60)
        if shift > timedelta(minutes=self.reschedule_window_min):
            return  # ponytail: outside the bounds needs a `change` approval (M2)
        old = clock(p["startsAt"])
        self.plan = {**p, "startsAt": _iso(_dt(p["startsAt"]) + shift), "endsAt": _iso(_dt(p["endsAt"]) + shift)}
        code = simulated_book(v, self.plan["startsAt"], party, fail=False)
        yield self._step(
            "reschedule",
            "done",
            f"Full at {old}, so I booked {clock(self.plan['startsAt'])} instead; everyone's still free",
        )
        yield {"type": "reschedule", "startsAt": self.plan["startsAt"], "endsAt": self.plan["endsAt"]}
        yield self._step("book", "done", f"Booked {self._seat(party)} at {v['name']}", detail=f"Confirmation {code}")
        yield {
            "type": "booking",
            "booking": {
                "status": "booked",
                "label": f"Booked · {code}",
                "provider": PROVIDER,
                "confirmationCode": code,
            },
        }
        yield from self._finish()

    def _finish(self) -> Iterator[dict]:
        cal = self._find("calendar")
        # ponytail: done on write; "done when every attendee applied it" needs syncCalendar acks from slice A (M2)
        yield self._event_or_new(cal, "calendar", status="done", label="Added it to everyone's calendar")
        yield {"type": "calendar", "desired": "event"}
        going = len(self.attendees) - sum(1 for s in self.decided.values() if s == "declined")
        label = f"Private event · {going} going"
        yield self._event_or_new(
            self._find("event"), "event", status="done", label=f"Created a private event · {going} going"
        )
        yield {"type": "confirmed", "eventLabel": label}
        rem = self._find("reminder")
        yield self._event_or_new(rem, "reminder", status="done", label="I'll remind everyone when to leave")


def visible_steps(steps: list[dict], viewer_id: str) -> list[dict]:
    """What one attendee sees: shared steps plus only their own payment step, without the internal field."""
    return [{k: v for k, v in s.items() if k != "forUserId"} for s in steps if s.get("forUserId") in (None, viewer_id)]
