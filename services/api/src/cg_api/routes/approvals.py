"""listApprovals, decideApproval."""

from fastapi import APIRouter, Body

from cg_api.deps import User
from cg_api.domain import approvals
from cg_api.domain.http import call, items

router = APIRouter()


@router.get("/v1/approvals", operation_id="listApprovals")
async def list_approvals(user: User):
    return call("listApprovals", items(approvals.pending), user)


@router.post("/v1/approvals/{approvalId}/decision", operation_id="decideApproval")
async def decide_approval(approvalId: str, user: User, body: dict = Body(...)):
    return call("decideApproval", approvals.decide, user, approvalId, body.get("decision"))
