"""joinPlan, withdrawJoin, listJoins."""

from fastapi import APIRouter, Body, Response

from cg_api.deps import User
from cg_api.domain import joins
from cg_api.domain.http import call, items, warm

router = APIRouter()


@router.post("/v1/plans/{planId}/join", operation_id="joinPlan")
async def join_plan(planId: str, user: User, body: dict | None = Body(None)):
    return call("joinPlan", joins.join, user, planId, (body or {}).get("size"))


@router.delete("/v1/plans/{planId}/join", operation_id="withdrawJoin", status_code=204, response_class=Response)
async def withdraw_join(planId: str, user: User):
    call("withdrawJoin", joins.withdraw, user, planId)


@router.get("/v1/joins", operation_id="listJoins")
async def list_joins(user: User):
    await warm(user, lambda w: [j["planId"] for j in w.joins.values() if j["userId"] == user])
    return call("listJoins", items(joins.list_joins), user)
