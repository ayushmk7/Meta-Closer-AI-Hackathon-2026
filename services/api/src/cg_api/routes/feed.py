"""getFeed, plus the Muse bar's plan source and opt-in gate (slice D's routes/muse_bar.py)."""

from fastapi import APIRouter

from cg_api.deps import User
from cg_api.domain import plans, world
from cg_api.domain.http import call, warm

router = APIRouter()


@router.get("/v1/feed", operation_id="getFeed")
async def get_feed(user: User):
    await warm(user, lambda w: plans.ordered_ids(w, user, w.params["feed"]["size"]))
    return call("getFeed", plans.feed, user)


async def _plan_source(user: str) -> list[dict]:
    if world.current is None:
        return await _example_cards(user)
    await warm(user, lambda w: plans.ordered_ids(w, user))
    return call("askMuse", plans.ranked_cards, user)


async def _gate(user: str) -> None:
    if world.current is not None:
        call("askMuse", plans.require_opted_in, user)


try:  # D's Muse bar reads our ranked cards and opt-in check
    from cg_api.routes import muse_bar

    _example_cards = muse_bar.plan_source
    muse_bar.plan_source, muse_bar.gate = _plan_source, _gate
except ImportError:
    pass
