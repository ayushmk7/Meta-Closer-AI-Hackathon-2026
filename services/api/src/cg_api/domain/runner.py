"""Drives D's ScriptedRun from the meetup store: apply each event, emit it, pause demo.stepDelayS between steps.

Without cg_api.agent (D not on the base yet) it falls back to the AgentRunner port (a no-op stub).
"""

from __future__ import annotations

import asyncio
import logging
import random
from collections import deque
from collections.abc import Iterable

from cg_api import ports
from cg_api.domain import approvals, chat, meetups, plans, privacy
from cg_api.domain.world import World, iso
from cg_api.domain.world import _spawn as world_spawn

log = logging.getLogger("cg_api.domain.runner")

try:
    from cg_api.agent import ScriptedRun
except ImportError:  # ponytail: D's module lands with its PR; until then steps come only from the port
    ScriptedRun = None


def _delay(w: World) -> float:
    if not w.demo_mode:
        return 0.0
    lo, hi = w.params["demo"]["stepDelayS"]
    return random.uniform(lo, hi)


def apply(w: World, meetup_id: str, ev: dict) -> None:
    """Persist one ScriptedRun event. P11 is re-checked here, not trusted from the run."""
    m = w.meetups[meetup_id]
    t = ev["type"]
    if t == "step":
        meetups.upsert_step(w, meetup_id, ev["step"])
    elif t == "approval":
        approvals.add(w, dict(ev["approval"]))
    elif t == "payment":
        uid, state = ev["userId"], ev["myPayment"]
        if state == "paid":
            approvals.pay(w, meetup_id, uid, w.plans[m["planId"]]["cost"]["perPersonCents"])  # raises without approval
        else:
            m["members"][uid]["payment"] = state
        w.emit(uid, "meetup.updated", meetups.view(w, uid, meetup_id))
    elif t == "release":
        uid = ev["userId"]
        if m["members"][uid]["rsvp"] == "going":
            m["members"][uid]["rsvp"] = "left"
            chat.cut_off(w, m["threadId"], uid)
            first = privacy.person_card(w, uid)["displayName"].split()[0]
            chat.post(w, m["threadId"], "muse", None, f"{first} can't make this one.")  # nothing more (P6)
            w.emit(uid, "calendar.changed")
    elif t == "booking":
        m["booking"] = dict(ev["booking"])
    elif t == "reschedule":
        m["startsAt"], m["endsAt"] = ev["startsAt"], ev["endsAt"]
        for uid in meetups.going(m):
            w.emit(uid, "calendar.changed")
    elif t == "calendar":
        for uid in meetups.going(m):
            w.emit(uid, "calendar.changed")
    elif t == "confirmed":
        m["eventLabel"] = ev["eventLabel"]
        meetups.set_status(w, meetup_id, "confirmed")
        return
    elif t == "cancelled":
        cancel(w, meetup_id, ev.get("reason") or "I had to cancel this one.")
        return
    else:
        log.info("runner: skipping unknown event %s", t)
        return
    if t != "step":
        for uid in meetups.going(m):
            w.emit(uid, "meetup.updated", meetups.view(w, uid, meetup_id))


def cancel(w: World, meetup_id: str, reason: str) -> None:
    """Meetup -> cancelled (directives -> none), then Muse posts the reason and alternatives everyone may see."""
    m = w.meetups[meetup_id]
    if m["status"] == "cancelled":
        return
    people = meetups.going(m)
    meetups.set_status(w, meetup_id, "cancelled")
    alts = None
    for uid in people:  # only plans visible to every member (invite plans stay private)
        ids = [a["planId"] for a in plans.detail(w, uid, w.plans[m["planId"]])["alternatives"]]
        alts = ids if alts is None else [i for i in alts if i in ids]
    alts = alts or []
    text = reason + (" Here are some similar plans." if alts else "")
    chat.post(w, m["threadId"], "muse", None, text, [{"kind": "plan", "planId": pid} for pid in alts])
    for uid in people:
        w.emit(uid, "thread.updated", chat.thread_view(w, uid, w.threads[m["threadId"]]))


async def drive(w: World, meetup_id: str, events: Iterable[dict]) -> None:
    for ev in events:
        apply(w, meetup_id, ev)
        if ev["type"] == "step":
            await asyncio.sleep(_delay(w))


def _enqueue(w: World, meetup_id: str, item) -> None:
    """One driver per meetup: items (event iterables or async callables) run strictly in order, never interleaved."""
    q = w.run_queues.setdefault(meetup_id, deque())
    q.append(item)
    if len(q) > 1:
        return  # the active driver picks it up
    try:
        asyncio.get_running_loop().create_task(_driver(w, meetup_id))
    except RuntimeError:  # no loop (pure tests): drain synchronously, no pauses
        while q:
            try:
                if callable(q[0]):
                    asyncio.run(q[0]())
                else:
                    for ev in q[0]:
                        apply(w, meetup_id, ev)
            finally:
                q.popleft()


async def _driver(w: World, meetup_id: str) -> None:
    q = w.run_queues[meetup_id]
    while q:
        try:
            await (q[0]() if callable(q[0]) else drive(w, meetup_id, q[0]))
        except Exception:
            log.exception("runner: %s item failed; continuing", meetup_id)
        finally:
            q.popleft()


def group_interests(w: World, user_ids: list[str]) -> list[dict]:
    """Full-depth interests every member shares with every other member: safe in one message to all (P1-P4)."""
    if len(user_ids) < 2:
        return []
    first, rest = user_ids[0], user_ids[1:]
    common = [i for i in privacy.shared_full(w, first, rest[0])]
    pairs = [(a, b) for k, a in enumerate(user_ids) for b in user_ids[k + 1 :]]
    ok = {i["id"] for i in common}
    for a, b in pairs:
        ok &= {i["id"] for i in privacy.shared_full(w, a, b)}
    return [i for i in common if i["id"] in ok]


async def post_intro(w: World, meetup_id: str) -> None:
    """Muse's intro and 3 starters in the group thread, at formation (PRD-2 §3.6)."""
    m = w.meetups[meetup_id]
    people = meetups.going(m)
    names = [privacy.person_card(w, u)["displayName"].split()[0] for u in people]
    shared = group_interests(w, people)
    plan = {**w.plans[m["planId"]], "venueName": w.venues[m["venueId"]]["name"]}
    try:
        text, starters = await ports.ports.copy.intro(names, [privacy.copy_interest(w, i) for i in shared], plan)
    except Exception:
        log.warning("runner: intro copy failed for %s; using template", meetup_id)
        text = f"{', '.join(names)}, meet each other! I'm handling the booking and the calendar."
        starters = ["What got you into this?", "Been here before?", "Anyone up for food after?"]
    chat.post(
        w,
        m["threadId"],
        "muse",
        None,
        text,
        [{"kind": "starters", "starters": [s[:89] for s in starters[:3]]}, {"kind": "meetup", "meetupId": meetup_id}],
    )


def start(w: World, meetup_id: str) -> None:
    """World.on_formed: intro first, then one run per new meetup."""
    _enqueue(w, meetup_id, lambda: post_intro(w, meetup_id))
    if ScriptedRun is None:
        world_spawn(ports.ports.agent.start(meetup_id))
        return
    m = w.meetups[meetup_id]
    plan = {**w.plans[m["planId"]], "startsAt": m["startsAt"], "endsAt": m["endsAt"]}
    attendees = [
        {
            "userId": u,
            "firstName": privacy.person_card(w, u)["displayName"].split()[0],
            "spendWithoutAskingCents": w.users[u]["museSettings"].get("spendWithoutAskingCents", 0),
        }
        for u in meetups.going(m)
    ]
    mp = w.params["muse"]
    run = ScriptedRun(
        meetup_id=meetup_id,
        plan=plan,
        venue=w.venues[m["venueId"]],
        attendees=attendees,
        now=iso(w.now()),
        new_id=lambda prefix: w.next_id(prefix.rstrip("_") + "_"),
        reschedule_window_min=mp["rescheduleWindowMin"],
        approval_expires_hours=mp["approvalExpiresHours"],
        fail_next_booking=w.demo.pop("failNextBooking", False),
    )
    w.runs[meetup_id] = run
    _enqueue(w, meetup_id, run.start())


def decided(w: World, a: dict) -> None:
    """World.on_decided: feed approved / declined / expired back into the run."""
    run = w.runs.get(a["meetupId"])
    if run is None:
        world_spawn(ports.ports.agent.on_approval(a["approvalId"]))
        return
    _enqueue(w, a["meetupId"], run.decide(a["approvalId"], a["status"]))
