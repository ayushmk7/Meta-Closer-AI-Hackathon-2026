"""askMuse (PRD-2 §3.4): the Muse bar. Muse or the keyword fallback turns text into a filter over the viewer's
ranked PlanCards. Slice C plugs in `plan_source` (ranked cards for a viewer) and `gate` (optIn check).
A share's promptText ("Plan something like this") is just text: its venue name and activity become filters.
"""

from __future__ import annotations

import random
import re
import secrets
import time
from collections import defaultdict, deque
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

from fastapi import APIRouter
from pydantic import BaseModel

from cg_api.deps import User
from cg_api.errors import ApiError
from cg_api.muse import bar
from cg_api.muse.copy import on_day
from cg_api.ports import ports
from cg_api.settings import get_settings

router = APIRouter()


async def _no_cards(user_id: str) -> list[dict]:
    return []  # no world loaded: Muse finds nothing rather than inventing example plans


async def _no_gate(user_id: str) -> None:
    return None


plan_source: Callable[[str], Awaitable[list[dict]]] = _no_cards  # slice C: ranked PlanCards for the viewer
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


async def _create(user: str, text: str) -> dict | None:
    """createPlan from the bar's text; None when screened, rate limited, or unplaceable."""
    from cg_api.domain import create_plan, plans, world

    w = world.current
    if w is None:
        return None
    try:
        d = await create_plan.create(w, user, text)
    except world.Fail:
        return None
    return plans.card(w, user, w.plans[d["planId"]])


def _now() -> str:
    try:  # the demo world's clock when one is loaded, so "this weekend" matches the plans' calendar
        from cg_api.domain import world

        now = world.current.now() if world.current is not None else datetime.now(UTC)
    except ImportError:
        now = datetime.now(UTC)
    return now.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


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
    surprise = bool(re.fullmatch(r"surprise me\W*", text, re.IGNORECASE))
    cards = await plan_source(user)
    if surprise:  # no filter, no Muse round trip: 3 random upcoming meetups (+ a new one below)
        f, said = bar.keyword_filter("", _now(), s.contracts_dir), None
        cards = random.sample(cards, min(3, len(cards)))
    else:
        f, said = await bar.understand(ports.muse, text, history, _now(), s.contracts_dir)
    venues = list({c["venue"]["venueId"]: c["venue"] for c in cards}.values())
    venue = bar.nearest_venue(f["link"], venues) if f["link"] else bar.venue_in_text(text, venues)
    found, relaxed = bar.best(cards, f, venue["venueId"] if venue else None)
    plans = found[: s.params["feed"]["size"]]
    created = None
    # ponytail: every Surprise me makes a real plan; createPlan's userPlansPerWeek limit caps it, then it's picks only
    if surprise or not plans or relaxed:  # nothing fits exactly: make one
        made = await _create(user, f"{random.choice(bar.IDEAS)} this weekend" if surprise else text)
        if made:
            created, relaxed = made["planId"], False
            plans = [made, *plans] if surprise else [made]
    if surprise and plans:
        first = plans[0]
        lead = "Here's something new" if created else "Try this one"
        more = f" Plus {len(plans) - 1} more to try." if len(plans) > 1 else ""
        answer = f"{lead}: {first['title']}{on_day(first['title'], first['startsAt'])}.{more}"
    elif created:
        answer = f"Nothing fit, so I set one up: {plans[0]['title']}. You're in."
    else:
        answer = said if said and plans and not relaxed else bar.reply(plans, f, relaxed)
    history += [{"role": "user", "content": text}, {"role": "assistant", "content": answer}]
    return {
        "conversationId": cid,
        "reply": {"messageId": f"mm_{secrets.token_hex(8)}", "text": answer, "createdAt": _now()},
        "plans": plans,
        "createdPlanId": created,
        "prompts": bar.follow_ups(text),
    }
