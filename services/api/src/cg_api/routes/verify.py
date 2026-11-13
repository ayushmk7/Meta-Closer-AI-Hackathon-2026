"""verifyAttendee: one scan (or typed code) confirms both people in person."""

from fastapi import APIRouter, Body

from cg_api.deps import User
from cg_api.domain import verify
from cg_api.domain.http import REQUEST_BASE, call

router = APIRouter(dependencies=REQUEST_BASE)


@router.post("/v1/meetups/{meetupId}/verify", operation_id="verifyAttendee")
async def verify_attendee(meetupId: str, user: User, body: dict = Body(...)):
    code = body.get("code")
    return call("verifyAttendee", verify.verify, user, meetupId, code if isinstance(code, str) else "")
