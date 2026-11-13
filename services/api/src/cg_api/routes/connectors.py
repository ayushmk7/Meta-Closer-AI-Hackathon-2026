"""listConnectors, connectConnector, disconnectConnector, listSignals, setSignalVisibility, deleteSignal."""

from __future__ import annotations

from fastapi import APIRouter, Response

from cg_api import seed
from cg_api.deps import Base, User
from cg_api.errors import ApiError
from cg_api.internal import gcal
from cg_api.routes.me import VisibilityBody
from cg_api.settings import get_settings
from cg_api.store import now_iso, store
from cg_api.store.bridge import changed
from cg_api.store.views import connector_view, require_opted_in, signal_view

router = APIRouter()


def _providers() -> dict:
    return get_settings().contract("connectors.yaml")["providers"]


def _changed(uid: str) -> None:
    changed(uid, "signals.updated", "me.updated")


@router.get("/v1/connectors", operation_id="listConnectors")
def list_connectors(uid: User):
    require_opted_in(uid)
    return {"items": [connector_view(uid, p) for p in _providers()]}


@router.post("/v1/connectors/{provider}", operation_id="connectConnector")
async def connect_connector(provider: str, uid: User):
    u = require_opted_in(uid)
    spec = _providers().get(provider)
    if not spec:
        raise ApiError(404, "not_found", "We don't know that app.")
    if spec["status"] == "coming_soon":
        raise ApiError(409, "conflict", "That one is coming soon.")
    if provider not in u["connectors"]:
        at = now_iso()
        u["connectors"][provider] = {"connectedAt": at, "lastSyncAt": at}
        # live Google busy blocks replace the seeded ones when linked; else this activates the seeded records
        if not await gcal.refresh(uid, force=True):
            await seed.derive(uid)  # (device_calendar: busy via syncCalendar)
        _changed(uid)
    return connector_view(uid, provider)


@router.delete("/v1/connectors/{provider}", operation_id="disconnectConnector", status_code=204)
async def disconnect_connector(provider: str, uid: User):
    u = require_opted_in(uid)
    if provider not in _providers():
        raise ApiError(404, "not_found", "We don't know that app.")
    if u["connectors"].pop(provider, None) is not None:
        # Records go inactive; derive drops their signals, evidence and busy blocks.
        u["busy"] = [b for b in u["busy"] if b["source"] != provider]
        await seed.derive(uid)
        _changed(uid)
    return Response(status_code=204)


@router.get("/v1/signals", operation_id="listSignals")
def list_signals(uid: User, base: Base):
    u = require_opted_in(uid)
    return {"items": [signal_view(s, base) for s in u["signals"].values()]}


def _signal(uid: str, signal_id: str) -> dict:
    s = require_opted_in(uid)["signals"].get(signal_id)
    if not s:
        raise ApiError(404, "not_found", "That isn't here anymore.")
    return s


@router.put("/v1/signals/{signalId}", operation_id="setSignalVisibility")
def set_signal_visibility(signalId: str, body: VisibilityBody, uid: User, base: Base):
    s = _signal(uid, signalId)
    s["visibility"] = body.visibility
    _changed(uid)
    return signal_view(s, base)


@router.delete("/v1/signals/{signalId}", operation_id="deleteSignal", status_code=204)
def delete_signal(signalId: str, uid: User):
    _signal(uid, signalId)
    u = store.users[uid]
    del u["signals"][signalId]
    u["deletedSignals"].add(signalId)
    _changed(uid)
    return Response(status_code=204)
