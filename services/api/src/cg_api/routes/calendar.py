"""syncCalendar: device busy blocks in, directives out (C7, P7)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter
from pydantic import AwareDatetime, BaseModel

from cg_api.deps import User
from cg_api.errors import ApiError
from cg_api.settings import get_settings
from cg_api.store import now_iso, store
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
    return {"acceptedBusy": len(blocks), "directives": list(store.directives.get(uid, {}).values())}
