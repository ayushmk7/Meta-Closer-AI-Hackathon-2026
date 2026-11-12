"""Glue for routes/: the live World, Fail -> ApiError, and the spec example until a world is loaded."""

from __future__ import annotations

import logging
from typing import Any, Callable

from cg_api import contracts
from cg_api.domain import world
from cg_api.errors import ApiError

log = logging.getLogger("cg_api.domain")


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
