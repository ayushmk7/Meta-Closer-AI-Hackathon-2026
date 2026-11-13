"""listShares (public), shareMeetup, likeShare."""

from typing import Annotated

from fastapi import APIRouter, Body, Header

from cg_api.deps import User
from cg_api.domain import shares, world
from cg_api.domain.http import REQUEST_BASE, call, items

router = APIRouter(dependencies=REQUEST_BASE)


@router.get("/v1/shares", operation_id="listShares")
async def list_shares(
    activityType: str | None = None,
    neighborhood: str | None = None,
    venueId: str | None = None,
    x_cg_user: Annotated[str | None, Header()] = None,
):
    # security: [] -> anyone may look; a known identity only adds likedByMe / mine
    w = world.current
    viewer = x_cg_user if w is not None and x_cg_user in w.users else None
    return call("listShares", items(shares.list_shares), viewer, activityType, neighborhood, venueId)


@router.post("/v1/meetups/{meetupId}/share", operation_id="shareMeetup")
async def share_meetup(meetupId: str, user: User, body: dict = Body(...)):
    return call("shareMeetup", shares.share_meetup, user, meetupId, body.get("caption"))


@router.put("/v1/shares/{shareId}/like", operation_id="likeShare")
async def like_share(shareId: str, user: User, body: dict = Body(...)):
    return call("likeShare", shares.like, user, shareId, body.get("liked"))
