"""listMeetups, getMeetup, leaveMeetup. my-status, checkIn and sendFeedback are M2 (spec example meanwhile)."""

from fastapi import APIRouter, Body

from cg_api.deps import User
from cg_api.domain import meetups
from cg_api.domain.http import call, items

router = APIRouter()


@router.get("/v1/meetups", operation_id="listMeetups")
async def list_meetups(user: User):
    return call("listMeetups", items(meetups.list_meetups), user)


@router.get("/v1/meetups/{meetupId}", operation_id="getMeetup")
async def get_meetup(meetupId: str, user: User):
    return call("getMeetup", meetups.view, user, meetupId)


@router.post("/v1/meetups/{meetupId}/leave", operation_id="leaveMeetup")
async def leave_meetup(meetupId: str, user: User, body: dict | None = Body(None)):
    return call("leaveMeetup", meetups.leave, user, meetupId)  # the note is never shown to others (P6)
