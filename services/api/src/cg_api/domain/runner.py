"""Drives D's ScriptedRun from the meetup store: apply each event, emit it, pause demo.stepDelayS between steps.

Without cg_api.agent (D not on the base yet) it falls back to the AgentRunner port (a no-op stub).
"""

from __future__ import annotations

import asyncio
import logging
import random
from collections.abc import Iterable

from cg_api import ports
from cg_api.domain import approvals, chat, meetups, privacy
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
    else:
        log.info("runner: skipping unknown event %s", t)
        return
    if t != "step":
        for uid in meetups.going(m):
            w.emit(uid, "meetup.updated", meetups.view(w, uid, meetup_id))


async def drive(w: World, meetup_id: str, events: Iterable[dict]) -> None:
    for ev in events:
        apply(w, meetup_id, ev)
        if ev["type"] == "step":
            await asyncio.sleep(_delay(w))


def _spawn(w: World, meetup_id: str, events: Iterable[dict]) -> None:
    try:
        asyncio.get_running_loop().create_task(drive(w, meetup_id, events))
    except RuntimeError:  # no loop (pure tests): run synchronously, no pauses
        for ev in events:
            apply(w, meetup_id, ev)


def start(w: World, meetup_id: str) -> None:
    """World.on_formed: one run per new meetup."""
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
    _spawn(w, meetup_id, run.start())


def decided(w: World, a: dict) -> None:
    """World.on_decided: feed approved / declined / expired back into the run."""
    run = w.runs.get(a["meetupId"])
    if run is None:
        world_spawn(ports.ports.agent.on_approval(a["approvalId"]))
        return
    _spawn(w, a["meetupId"], run.decide(a["approvalId"], a["status"]))
