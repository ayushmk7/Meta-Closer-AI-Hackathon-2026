"""Synthetic counterparts (PRD-2 §3.9): seeded people answer Muse's approvals so the demo plan reaches confirmed.

`on_approval(w, a)` is the World hook for every new approval. It answers for synthetic users (not the live second
phone in `live` mode) after `demo.syntheticDelayS`, through the same `approvals.decide` a person would use, so P11
holds: payments still only complete on an approved approval. The setting is read when the action runs, so a
mid-plan mode switch takes effect on the next action (D3).
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import random

log = logging.getLogger("cg_api.synthetic")


def _demo_state() -> dict:
    from cg_api.store import store  # late: the store is rebuilt on seed load

    return store.demo_state


def acts_for(w, user_id: str, state: dict) -> bool:
    u = w.users.get(user_id) or {}
    if not u.get("synthetic"):
        return False
    return not (state.get("counterpart") == "live" and user_id == state.get("liveUserId"))


def choice(approval_id: str, forced_yes: bool) -> str:
    """forcedYes: always approve. Otherwise a deterministic 80% yes per approval."""
    # ponytail: fixed 0.8; use the Laya show_up table for this user once M2 needs realism
    if forced_yes:
        return "approve"
    return "approve" if int(hashlib.sha256(approval_id.encode()).hexdigest()[:8], 16) % 10 < 8 else "decline"


async def answer(w, approval_id: str, delay_s: float) -> None:
    from cg_api.domain import approvals

    await asyncio.sleep(delay_s)
    a = w.approvals.get(approval_id)
    state = _demo_state()
    if not a or a["status"] != "pending" or not acts_for(w, a["userId"], state):
        return  # already decided, or the live phone took over
    approvals.decide(w, a["userId"], approval_id, choice(approval_id, state.get("forcedYes", True)))
    log.info("synthetic %s answered %s", a["userId"], approval_id)


def on_approval(w, a: dict) -> None:
    if not acts_for(w, a["userId"], _demo_state()):
        return
    lo, hi = w.params["demo"]["syntheticDelayS"]
    delay = random.uniform(lo, hi) if w.demo_mode else 0.0
    try:
        asyncio.get_running_loop().create_task(answer(w, a["approvalId"], delay))
    except RuntimeError:  # no loop (pure tests): answer now
        asyncio.run(answer(w, a["approvalId"], 0.0))
