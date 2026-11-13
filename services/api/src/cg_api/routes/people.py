"""listConnections, getPerson."""

from fastapi import APIRouter

from cg_api.deps import User
from cg_api.domain import people
from cg_api.domain.http import REQUEST_BASE, call, items

router = APIRouter(dependencies=REQUEST_BASE)


@router.get("/v1/connections", operation_id="listConnections")
async def list_connections(user: User):
    return call("listConnections", items(people.list_connections), user)


@router.get("/v1/people/{userId}", operation_id="getPerson")
async def get_person(userId: str, user: User):
    return call("getPerson", people.get_person, user, userId)
