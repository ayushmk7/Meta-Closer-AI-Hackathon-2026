"""Demo controls: getDemoState, setDemoState, resetDemo, advanceMeetup."""

from __future__ import annotations

import logging
import math
import re
import time
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Response
from pydantic import BaseModel

from cg_api import realtime
from cg_api.domain.plans import TZ
from cg_api.errors import ApiError
from cg_api.ports import Unavailable, matching
from cg_api.settings import get_settings
from cg_api.store import store

router = APIRouter()
log = logging.getLogger("cg_api.demo")


class LatLng(BaseModel):
    lat: float
    lng: float


class DemoState(BaseModel):
    counterpart: Literal["live", "synthetic"] | None = None
    liveUserId: str | None = None
    forcedYes: bool | None = None
    relaxCheckin: bool | None = None
    failNextBooking: bool | None = None
    simulatedPayments: bool | None = None
    fakeLocation: LatLng | None = None


@router.get("/internal/v1/demo", operation_id="getDemoState")
def get_demo_state():
    return store.demo_state


@router.put("/internal/v1/demo", operation_id="setDemoState")
def set_demo_state(body: DemoState):
    changes = body.model_dump(exclude_unset=True)
    if changes.get("liveUserId") and changes["liveUserId"] not in store.users:
        raise ApiError(400, "validation_failed", "liveUserId is not in the loaded pool.")
    store.demo_state.update(changes)  # takes effect immediately; synthetic actors read it on each action (D3)
    for uid in {(store.demo or {}).get("mayaId"), store.demo_state.get("liveUserId")} - {None}:
        realtime.emit(uid, "me.updated")  # config.demo changed
    log.info("demo state: %s", changes)
    return store.demo_state


@router.post("/internal/v1/demo/reset", operation_id="resetDemo", status_code=204)
def reset_demo():
    t = time.monotonic()
    store.reset()
    log.info("demo reset in %.2fs", time.monotonic() - t)
    return Response(status_code=204)


class Advance(BaseModel):
    to: Literal["leave_by", "window_open", "completed"]


def _z(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _travel(uid: str, venue_id: str) -> int:
    """Fastest allowed mode from the user's neighborhood centroid (P8), via cg_matching.travel_minutes."""
    u, v = store.users[uid], store.venues[venue_id]
    pts = [x["persona"]["homeLocation"] for x in store.users.values() if x["neighborhood"] == u["neighborhood"]]
    origin = (sum(p["lat"] for p in pts) / len(pts), sum(p["lng"] for p in pts) / len(pts))
    try:
        cgm = matching()
        params = cgm.Params(get_settings().params)
        dest = (v["location"]["lat"], v["location"]["lng"])
        return min(cgm.travel_minutes(origin, dest, m, params) for m in u["travel"]["modes"])
    except Unavailable:
        return get_settings().params["travel"]["defaultMaxMinutes"]


_WEEKDAY = re.compile(r"\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b")


def _retitle(title: str, start: datetime) -> str:
    """Seed titles name the day ("Sunday small plates"): keep it true after time travel moves the day."""
    return _WEEKDAY.sub(start.astimezone(TZ).strftime("%A"), title)


@router.post("/internal/v1/demo/meetups/{meetupId}/advance", operation_id="advanceMeetup")
def advance_meetup(meetupId: str, body: Advance):
    """Time-travel: shift the meetup's start/end (duration kept) so leave-by, check-in or feedback is now."""
    m = store.meetups.get(meetupId)
    if not m:
        raise ApiError(404, "not_found", "No such meetup.")
    p = get_settings().params
    now = datetime.now(UTC)
    start = datetime.fromisoformat(m["startsAt"])
    duration = datetime.fromisoformat(m["endsAt"]) - start
    members = list(m.get("members", {}))
    if body.to == "leave_by":
        # leaveBy = start - travel - buffer lands one minute from now for the demo user (else the slowest member)
        maya = (store.demo or {}).get("mayaId")
        who = [maya] if maya in members else members
        travel = max((_travel(u, m["venueId"]) for u in who if u in store.users), default=0)
        new_start = now + timedelta(minutes=1 + travel + p["travel"]["leaveByBufferMin"])
    elif body.to == "window_open":
        new_start = now + timedelta(minutes=math.floor(p["checkin"]["opensBeforeMin"] / 2))
    else:  # back by whole days, so it ended at its own time of day (Sun 7 PM -> Thu 7 PM), not at 3 AM
        new_start = start - timedelta(
            days=max(0, math.ceil((start + duration - now + timedelta(minutes=1)) / timedelta(days=1)))
        )
        if m.get("status") in ("setting_up", "confirmed"):
            m["status"] = "completed"
    m["startsAt"], m["endsAt"] = _z(new_start), _z(new_start + duration)
    if m.get("title"):
        m["title"] = _retitle(m["title"], new_start)
    if t := store.threads.get(m.get("threadId")):
        t["title"] = _retitle(t["title"], new_start)
    if p := store.plans.get(m.get("planId")):  # the plan pop-up and join must show the meetup's day (plan is closed)
        p["startsAt"], p["endsAt"], p["title"] = m["startsAt"], m["endsAt"], _retitle(p["title"], new_start)
    for uid in members:
        realtime.emit(uid, "meetup.updated", {"meetupId": meetupId})
        realtime.emit(uid, "calendar.changed")
    log.info("advanced %s to %s: starts %s", meetupId, body.to, m["startsAt"])
    return Response(status_code=200)
