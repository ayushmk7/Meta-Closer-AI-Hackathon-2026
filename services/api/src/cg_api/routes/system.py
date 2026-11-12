"""getHealth, getConfig, realtime (WebSocket placeholder until the M2 hub)."""

from __future__ import annotations

import json
import re
from pathlib import Path

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse

from cg_api import realtime
from cg_api.deps import User, current_user
from cg_api.errors import ApiError
from cg_api.settings import get_settings
from cg_api.store import store

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
    live = store.demo_state  # setDemoState changes these mid-demo
    demo = {
        "enabled": s.demo_mode,
        "counterpart": live.get("counterpart", d["counterpartDefault"]),
        "fakeLocation": live.get("fakeLocation"),
        "relaxCheckin": live.get("relaxCheckin", d["relaxCheckinDefault"]),
        "simulatedPayments": live.get("simulatedPayments", d["simulatedPayments"]),
        "stepDelayS": d["stepDelayS"],
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


_STATIC = {"avatars": "avatars", "venues": "venue_photos"}
_NAME = re.compile(r"^[a-z0-9_]+\.(png|jpe?g)$")


@router.get("/static/{kind}/{name}", name="static")
def static(kind: str, name: str):
    """Seed avatars and venue photos of the loaded pool. Names are checked, so no path escapes the seed folder."""
    if kind not in _STATIC or not _NAME.match(name) or not store.seed_dir:
        raise ApiError(404, "not_found", "That isn't here anymore.")
    path = Path(store.seed_dir) / _STATIC[kind] / name
    if not path.is_file():
        raise ApiError(404, "not_found", "That isn't here anymore.")
    return FileResponse(path, headers={"Cache-Control": "public, max-age=3600"})


@router.websocket("/v1/ws", name="realtime")
async def ws_realtime(ws: WebSocket, user: str = ""):
    try:
        current_user(user)  # same identity rule as REST: well-formed and in the loaded world
    except ApiError:
        await ws.close(code=1008)  # policy violation
        return
    await ws.accept()
    realtime.connect(user, ws)
    try:
        while True:
            if _frame(await ws.receive_text()).get("type") == "ping":
                await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        realtime.disconnect(user, ws)


def _frame(text: str) -> dict:
    """Client frames are untrusted: anything but a JSON object is ignored."""
    try:
        msg = json.loads(text)
    except ValueError:
        return {}
    return msg if isinstance(msg, dict) else {}
