"""checkIn, sendFeedback."""

from fastapi import APIRouter, Body, Response

from cg_api.deps import User
from cg_api.domain import verify
from cg_api.domain.http import REQUEST_BASE, call

router = APIRouter(dependencies=REQUEST_BASE)


@router.post("/v1/meetups/{meetupId}/checkin", operation_id="checkIn")
async def check_in(meetupId: str, user: User, body: dict = Body(...)):
    return call("checkIn", verify.check_in, user, meetupId, body.get("location"))


@router.post("/v1/meetups/{meetupId}/feedback", operation_id="sendFeedback", status_code=204, response_class=Response)
async def send_feedback(meetupId: str, user: User, body: dict = Body(...)):
    call("sendFeedback", verify.feedback, user, meetupId, body)
