"""joinPlan, withdrawJoin, listJoins."""

from fastapi import APIRouter, Body, Response

from cg_api.deps import User
from cg_api.domain import joins
from cg_api.domain.http import call, items

router = APIRouter()


@router.post("/v1/plans/{planId}/join", operation_id="joinPlan")
async def join_plan(planId: str, user: User, body: dict | None = Body(None)):
    size = (body or {}).get("size")
    return call("joinPlan", joins.join, user, planId, size if isinstance(size, dict) else None)


@router.delete("/v1/plans/{planId}/join", operation_id="withdrawJoin", status_code=204, response_class=Response)
async def withdraw_join(planId: str, user: User):
    call("withdrawJoin", joins.withdraw, user, planId)


@router.get("/v1/joins", operation_id="listJoins")
async def list_joins(user: User):
    return call("listJoins", items(joins.list_joins), user)
