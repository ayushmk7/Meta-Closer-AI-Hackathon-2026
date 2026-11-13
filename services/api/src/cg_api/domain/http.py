"""Glue for routes/: the live World, Fail -> ApiError, and the spec example until a world is loaded."""

from __future__ import annotations

import ipaddress
import logging
import socket
from collections.abc import Callable
from functools import lru_cache
from typing import Any

from fastapi import Depends, Request

from cg_api import contracts
from cg_api.domain import world
from cg_api.errors import ApiError

log = logging.getLogger("cg_api.domain")


@lru_cache(maxsize=64)
def _ours(host: str) -> bool:
    """True only for localhost or a literal IP bound on this machine. No DNS, so a spoofed name never passes."""
    if host == "localhost":
        return True
    try:
        ip = ipaddress.ip_address(host.strip("[]"))
        with socket.socket(socket.AF_INET6 if ip.version == 6 else socket.AF_INET) as sk:
            sk.bind((str(ip), 0))
        return True
    except (ValueError, OSError):
        return False


async def _use_request_base(request: Request) -> None:
    """The phone's own LAN address works for its static URLs; any other Host header is ignored (P10)."""
    host = request.url.hostname or ""
    world.request_base.set(str(request.base_url).rstrip("/") if _ours(host) else None)


# Router-level dependency on every C route.
REQUEST_BASE = [Depends(_use_request_base)]


def call(operation_id: str, fn: Callable[..., Any], *args: Any) -> Any:
    w = world.current
    if w is None:  # ponytail: M0 behaviour until A's store loads a seed into world.current
        log.info("no world loaded: example for %s", operation_id)
        return contracts.example(contracts.op_by_id(operation_id))
    try:
        return fn(w, *args)
    except world.Fail as e:
        raise ApiError(e.status, e.code, e.message, retryable=e.status >= 500) from e


def items(fn: Callable[..., list]) -> Callable[..., dict]:
    return lambda w, *a: {"items": fn(w, *a)}


async def warm(user: str, plan_ids: Callable[..., list[str]] | list[str]) -> None:
    """Fill Muse's per-viewer reasons before cards are built (no-op without a world or before opt-in)."""
    w = world.current
    if w is None or not w.users.get(user, {}).get("optedIn"):
        return
    from cg_api.domain import plans

    ids = plan_ids(w) if callable(plan_ids) else plan_ids
    await plans.warm_reasons(w, user, ids)
