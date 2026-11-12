"""askMuse (PRD-2 §3.4): the Muse bar. Muse or the keyword fallback turns text into a filter over the viewer's
ranked PlanCards. Slice C plugs in `plan_source` (ranked cards for a viewer) and `gate` (optIn check); until then
the spec's example cards are used so the bar is demo-able.
"""

from __future__ import annotations

import secrets
import time
from collections import defaultdict, deque
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

from fastapi import APIRouter
from pydantic import BaseModel

from cg_api import contracts
from cg_api.deps import User
from cg_api.errors import ApiError
from cg_api.muse import bar
from cg_api.ports import ports
from cg_api.settings import get_settings

router = APIRouter()


async def _example_cards(user_id: str) -> list[dict]:
    ex = [contracts.example(contracts.op_by_id(o)) for o in ("getFeed", "askMuse")]
    return list({c["planId"]: c for e in ex for c in e["plans"]}.values())


async def _no_gate(user_id: str) -> None:
    return None


plan_source: Callable[[str], Awaitable[list[dict]]] = _example_cards  # slice C: ranked PlanCards for the viewer
gate: Callable[[str], Awaitable[None]] = _no_gate  # slice C/A: raise ApiError(403, "not_opted_in", ...)

# ponytail: in-process conversations and rate limits; reset with the process (demo reset clears them via clear())
_conversations: dict[tuple[str, str], list[dict]] = {}
_asks: dict[str, deque] = defaultdict(deque)


def clear() -> None:
    _conversations.clear()
    _asks.clear()


class AskBody(BaseModel):
    text: str
    conversationId: str | None = None


def _now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


@router.post("/v1/muse/ask", operation_id="askMuse")
async def ask_muse(body: AskBody, user: User):
    s = get_settings()
    p = s.params["muse"]
    text = body.text.strip()
    if not text:
        raise ApiError(400, "validation_failed", "Tell me what you'd like to do.")
    if len(text) > p["askMaxChars"]:
        raise ApiError(400, "validation_failed", f"Keep it under {p['askMaxChars']} characters.")
    await gate(user)
    q, t = _asks[user], time.monotonic()
    while q and t - q[0] > 3600:
        q.popleft()
    if len(q) >= p["askPerHour"]:
        raise ApiError(429, "rate_limited", "You've asked a lot this hour. Try again a bit later.", retryable=True)
    q.append(t)

    # owner-scoped and unguessable: another user's id just starts a fresh conversation (P7, prompt privacy)
    cid = body.conversationId if (user, body.conversationId) in _conversations else f"mc_{secrets.token_hex(8)}"
    history = _conversations.setdefault((user, cid), [])
    f, said = await bar.understand(ports.muse, text, history, _now(), s.contracts_dir)
    cards = await plan_source(user)
    venue = bar.nearest_venue(f["link"], [c["venue"] for c in cards]) if f["link"] else None
    plans = bar.apply(cards, f, venue["venueId"] if venue else None)[: s.params["feed"]["size"]]
    # ponytail: creating a plan when nothing fits (createdPlanId) lands with slice C's createPlan pipeline
    answer = said if said and plans else bar.reply(plans, f)
    history += [{"role": "user", "content": text}, {"role": "assistant", "content": answer}]
    return {
        "conversationId": cid,
        "reply": {"messageId": f"mm_{secrets.token_hex(8)}", "text": answer, "createdAt": _now()},
        "plans": plans,
        "createdPlanId": None,
        "prompts": bar.follow_ups(text),
    }
