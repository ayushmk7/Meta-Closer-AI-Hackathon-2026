"""report, block."""

from fastapi import APIRouter, Body, Response

from cg_api.deps import User
from cg_api.domain import people
from cg_api.domain.http import call

router = APIRouter()


@router.post("/v1/reports", operation_id="report")
async def report(user: User, body: dict = Body(...)):
    return call("report", people.report, user, body)


@router.post("/v1/blocks", operation_id="block", status_code=204, response_class=Response)
async def block(user: User, body: dict = Body(...)):
    call("block", people.block, user, body.get("userId"))
