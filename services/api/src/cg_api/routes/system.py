"""getHealth, getConfig, realtime (WebSocket placeholder until the M2 hub)."""

from __future__ import annotations

import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from cg_api.deps import User, current_user
from cg_api.errors import ApiError
from cg_api.settings import get_settings

router = APIRouter()

# config.limits field -> (params section, key)  (CONTRACTS §2)
_LIMITS = {
    "feedMax": ("feed", "size"),
    "sharedCoarseMax": ("privacy", "sharedCoarseMax"),
    "sharedFullMax": ("privacy", "sharedFullMax"),
    "messageMaxChars": ("messages", "maxChars"),
    "museAskMaxChars": ("muse", "askMaxChars"),
    "groupSizeMin": ("groups", "strangerSizeMin"),
    "groupSizeMax": ("groups", "sizeMax"),
    "openJoinsMax": ("plans", "openJoinsMax"),
    "pollIntervalS": ("client", "pollIntervalS"),
    "feedRefreshS": ("client", "feedRefreshS"),
    "calendarSyncMinIntervalS": ("calendar", "syncMinIntervalS"),
    "calendarHorizonDays": ("calendar", "horizonDays"),
    "meetupStatusBeforeMin": ("meetups", "statusWindowBeforeMin"),
}

# Live demo state (counterpart, fakeLocation, ...) overrides these; set by the store/demo controls.
demo_overrides: dict = {}


@router.get("/v1/health", operation_id="getHealth")
def get_health():
    s = get_settings()
    return {
        "status": "ok",
        "muse": "fake" if s.muse_fake else "ok",
        "laya": "fake" if s.laya_fake else "ok",
        "demoMode": s.demo_mode,
        "apiVersion": "2",
    }


def build_config() -> dict:
    s = get_settings()
    p, modes = s.params, s.contract("modes.yaml")
    pools = {pool["mode"]: pool for pool in modes["pools"]}
    out_modes = []
    for mode, m in modes["modes"].items():
        if mode in pools:
            pool = pools[mode]
            out_modes.append({"mode": mode, "label": pool["label"], "poolId": pool["poolId"], "available": True,
                              "description": pool["description"], "center": pool["center"],
                              "radiusKm": pool["radiusKm"]})  # fmt: skip
        elif m["status"] == "specced":
            out_modes.append({"mode": mode, "label": m["label"], "poolId": f"pool_{mode}_placeholder",
                              "available": False, "description": "Coming soon"})  # fmt: skip
    d = p["demo"]
    demo = {
        "enabled": s.demo_mode,
        "counterpart": d["counterpartDefault"],
        "fakeLocation": None,
        "relaxCheckin": d["relaxCheckinDefault"],
        "simulatedPayments": d["simulatedPayments"],
        "stepDelayS": d["stepDelayS"],
        **demo_overrides,
    }
    return {
        "apiVersion": "2",
        "features": dict(p["features"]),
        "limits": {k: p[sec][key] for k, (sec, key) in _LIMITS.items()},
        "modes": out_modes,
        "demo": demo,
    }


@router.get("/v1/config", operation_id="getConfig")
def get_config(_: User):
    return build_config()


@router.websocket("/v1/ws", name="realtime")
async def ws_realtime(ws: WebSocket, user: str = ""):
    try:
        current_user(user)  # same identity rule as REST
    except ApiError:
        await ws.close(code=1008)  # policy violation
        return
    # ponytail: accept + pong only; the M2 hub (cg_api.realtime) pushes RealtimeEvent frames.
    await ws.accept()
    try:
        while True:
            if _frame(await ws.receive_text()).get("type") == "ping":
                await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass


def _frame(text: str) -> dict:
    """Client frames are untrusted: anything but a JSON object is ignored."""
    try:
        msg = json.loads(text)
    except ValueError:
        return {}
    return msg if isinstance(msg, dict) else {}
