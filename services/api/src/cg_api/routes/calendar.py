"""syncCalendar: device busy blocks in, directives out (C7, P7)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter
from pydantic import AwareDatetime, BaseModel

from cg_api.deps import User
from cg_api.errors import ApiError
from cg_api.settings import get_settings
from cg_api.store import bridge, now_iso, store
from cg_api.store.views import require_opted_in

router = APIRouter()
Desired = Literal["none", "hold", "event"]


class Block(BaseModel):
    start: AwareDatetime
    end: AwareDatetime


class Applied(BaseModel):
    key: str
    desired: Desired
    ok: bool


class CalendarSync(BaseModel):
    source: Literal["device_calendar"]
    horizonStart: AwareDatetime
    horizonEnd: AwareDatetime
    busy: list[Block]
    applied: list[Applied]


def _z(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


@router.post("/v1/calendar/sync", operation_id="syncCalendar")
def sync_calendar(body: CalendarSync, uid: User):
    u = require_opted_in(uid)
    if body.horizonEnd <= body.horizonStart:
        raise ApiError(400, "validation_failed", "The calendar window is empty.")
    limit = body.horizonStart + timedelta(days=get_settings().params["calendar"]["horizonDays"])
    start, end = body.horizonStart, min(body.horizonEnd, limit)
    blocks = [b for b in body.busy if b.end > b.start and b.end > start and b.start < end]
    # Replace device blocks inside the window; keep ones outside it and blocks from other providers.
    u["busy"] = [
        b for b in u["busy"]
        if b["source"] != "device_calendar" or b["end"] <= _z(start) or b["start"] >= _z(end)
    ] + [{"start": _z(max(b.start, start)), "end": _z(min(b.end, end)), "source": "device_calendar"} for b in blocks]  # fmt: skip
    conn = u["connectors"].setdefault("device_calendar", {"connectedAt": now_iso(), "lastSyncAt": None})
    conn["lastSyncAt"] = now_iso()
    applied = store.applied.setdefault(uid, {})
    for a in body.applied:
        if a.ok:
            applied[a.key] = a.desired
    bridge.sync(uid)
    return {"acceptedBusy": len(blocks), "directives": directives_for(uid)}


def directives_for(uid: str) -> list[dict]:
    """The calendar state this device should have now (CONTRACTS §5 Calendar directive), derived live from the
    domain's joins and meetups (slice C builds each one; P7: own only, no other names). A `none` is sent only for
    keys the device still holds, until it reports that it applied it."""
    applied = store.applied.get(uid, {})
    out: dict[str, dict] = {}
    if store.world is not None:
        from cg_api.domain import joins, meetups

        w = store.world
        for j in w.joins.values():
            if j["userId"] != uid:
                continue
            d = _tidy(joins.hold(w, j), w.venues[w.plans[j["planId"]]["venueId"]]["name"])
            if (
                d is None and applied.get(j["joinId"], "none") != "none"
            ):  # matched: the meetup's event replaces the hold
                p = w.plans[j["planId"]]
                d = {"key": j["joinId"], "desired": "none", "title": p["title"][:120], "startsAt": p["startsAt"],
                     "endsAt": p["endsAt"]}  # fmt: skip
            if d is not None:
                out[d["key"]] = d
        for m in w.meetups.values():
            if uid in m.get("members", {}):
                out[m["meetupId"]] = _tidy(meetups.directive(w, uid, m), w.venues[m["venueId"]]["name"])
    out.update(store.directives.get(uid, {}))  # explicit writes win
    return [d for d in out.values() if d["desired"] != "none" or applied.get(d["key"], "none") != "none"]


def _tidy(d: dict | None, venue: str) -> dict | None:
    """Titles already naming the venue get no second " at <venue>" ("Brunch at Nopal Table at Nopal Table").
    ponytail: patches slice C's title builders at the serving edge; drop once they check this themselves."""
    suffix = f" at {venue}"
    if d and d["title"].endswith(suffix) and venue in d["title"][: -len(suffix)]:
        d = {**d, "title": d["title"][: -len(suffix)]}
    return d
