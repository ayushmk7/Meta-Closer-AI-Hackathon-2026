"""getPlan, createPlan."""

from fastapi import APIRouter, Body

from cg_api.deps import User
from cg_api.domain import create_plan as create_plan_mod
from cg_api.domain import plans
from cg_api.domain.http import REQUEST_BASE, acall, call, warm

router = APIRouter(dependencies=REQUEST_BASE)


def _detail(w, user: str, plan_id: str) -> dict:
    plans.require_opted_in(w, user)
    return plans.detail(w, user, plans.get(w, user, plan_id))


@router.get("/v1/plans/{planId}", operation_id="getPlan")
async def get_plan(planId: str, user: User):
    await warm(user, [planId])
    return call("getPlan", _detail, user, planId)


@router.post("/v1/plans", operation_id="createPlan")
async def create_plan(user: User, body: dict = Body(...)):
    return await acall("createPlan", create_plan_mod.create, user, body.get("text"), body.get("inviteUserIds"))
