"""Synthetic counterparts (PRD-2 §3.9): seeded people answer Muse's approvals and reply in the group chat.

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


FALLBACK_LINES = ("Sounds great, see you there!", "Can't wait!", "Looking forward to it 🙂", "Nice, I'm in!")


async def _say(w, uid: str, thread_id: str, text: str, msg_id: str) -> str:
    """One short in-character line from this persona's public profile; templated when Muse is unavailable (D4)."""
    from cg_api import ports

    u = w.users[uid].get("persona") or {}
    name = u.get("firstName") or w.users[uid]["displayName"].split()[0]
    m = w.meetups.get(w.threads[thread_id].get("meetupId"), {})
    prompt = (
        f"You are {name}, a real person in a small group chat for a meetup: {m.get('title', 'a meetup')}. "
        f"Your public bio: {u.get('bio', '')}. Someone in the group just wrote: {text!r}. "
        "Reply casually in one short sentence (max 15 words), no hashtags, don't mention being an AI."
    )
    try:
        r = await ports.ports.muse.respond("chat.synthetic", [{"role": "user", "content": prompt}], effort="low")
        if line := (r.get("text") or "").strip().strip('"'):
            return line[:200]
    except ports.Unavailable:
        pass
    return FALLBACK_LINES[int(hashlib.sha256(msg_id.encode()).hexdigest()[:8], 16) % len(FALLBACK_LINES)]


async def reply(w, msg: dict, uid: str, delay_s: float) -> None:
    from cg_api.domain import chat

    await asyncio.sleep(delay_s)
    if not acts_for(w, uid, _demo_state()):
        return
    line = await _say(w, uid, msg["threadId"], msg["text"], msg["messageId"])
    chat.post(w, msg["threadId"], "user", uid, line)
    log.info("synthetic %s replied in %s", uid, msg["threadId"])


def on_message(w, msg: dict) -> None:
    """A person posted in a group thread: one synthetic member answers after demo.syntheticDelayS (PRD-2 §3.9)."""
    t = w.threads.get(msg["threadId"]) or {}
    sender = msg["sender"].get("userId")
    left = t.get("cutoff", {})
    who = sorted(u for u in t.get("members", []) if u != sender and u not in left and acts_for(w, u, _demo_state()))
    if not who:
        return
    uid = who[int(hashlib.sha256(msg["messageId"].encode()).hexdigest()[:8], 16) % len(who)]
    lo, hi = w.params["demo"]["syntheticDelayS"]
    delay = random.uniform(lo, hi) if w.demo_mode else 0.0
    try:
        asyncio.get_running_loop().create_task(reply(w, msg, uid, delay))
    except RuntimeError:  # no loop (pure tests): answer now
        asyncio.run(reply(w, msg, uid, 0.0))
