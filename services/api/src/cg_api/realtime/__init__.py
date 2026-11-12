"""In-memory realtime hub (CONTRACTS §6). Call `emit(user_id, type, data)` after committing a state change.

ponytail: single process, per-user set of sockets, fire-and-forget. Events are hints; REST is the truth.
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict

from fastapi import WebSocket

from cg_api.store import now_iso

log = logging.getLogger("cg_api.realtime")
_sockets: dict[str, set[WebSocket]] = defaultdict(set)
_seq = 0
_loop: asyncio.AbstractEventLoop | None = None  # server loop, captured on the first connect
sent: list[dict] = []  # last events, for tests and metrics


def connect(user_id: str, ws: WebSocket) -> None:
    global _loop
    _loop = asyncio.get_running_loop()
    _sockets[user_id].add(ws)


def disconnect(user_id: str, ws: WebSocket) -> None:
    _sockets[user_id].discard(ws)


def emit(user_id: str, type: str, data: dict | None = None) -> None:
    global _seq
    _seq += 1
    frame = {"type": type, "eventId": f"ev_{_seq:06d}", "at": now_iso(), "data": data or {}}
    sent.append({"userId": user_id, **frame})
    del sent[:-500]
    for ws in list(_sockets.get(user_id, ())):
        # Works from async handlers and from sync ones running in the threadpool.
        asyncio.run_coroutine_threadsafe(_send(user_id, ws, frame), _loop)


async def _send(user_id: str, ws: WebSocket, frame: dict) -> None:
    try:
        await ws.send_json(frame)
    except Exception:  # noqa: BLE001 - a dead socket must never break the emitter
        disconnect(user_id, ws)
