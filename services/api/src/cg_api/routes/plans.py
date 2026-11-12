"""getPlan. createPlan stays on the spec example until the Muse pipeline (D) lands."""

from fastapi import APIRouter

from cg_api.deps import User
from cg_api.domain import plans
from cg_api.domain.http import call, warm

router = APIRouter()


def _detail(w, user: str, plan_id: str) -> dict:
    plans.require_opted_in(w, user)
    return plans.detail(w, user, plans.get(w, user, plan_id))


@router.get("/v1/plans/{planId}", operation_id="getPlan")
async def get_plan(planId: str, user: User):
    await warm(user, [planId])
    return call("getPlan", _detail, user, planId)
