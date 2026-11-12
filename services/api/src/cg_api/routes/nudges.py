"""listNudges, dismissNudge."""

from fastapi import APIRouter, Body, Response

from cg_api.deps import User
from cg_api.domain import nudges, world
from cg_api.domain.http import REQUEST_BASE, call, items

router = APIRouter(dependencies=REQUEST_BASE)


@router.get("/v1/nudges", operation_id="listNudges")
async def list_nudges(user: User, surface: str | None = None):
    if world.current is not None:
        await nudges.refresh(world.current, user)
    return call("listNudges", items(nudges.list_nudges), user, surface)


@router.post("/v1/nudges/{nudgeId}/dismiss", operation_id="dismissNudge", status_code=204, response_class=Response)
async def dismiss_nudge(nudgeId: str, user: User, body: dict | None = Body(None)):
    call("dismissNudge", nudges.dismiss, user, nudgeId, (body or {}).get("mute"))
