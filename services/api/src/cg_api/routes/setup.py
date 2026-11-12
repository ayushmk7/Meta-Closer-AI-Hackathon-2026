"""optIn, optOut, getSetup, completeSetup."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Response
from pydantic import BaseModel, Field

from cg_api import realtime, seed
from cg_api.deps import Base, User
from cg_api.errors import ApiError
from cg_api.ports import ports
from cg_api.routes.me import GroupSize, Slot, Travel, apply_profile
from cg_api.settings import get_settings
from cg_api.store import store
from cg_api.store.views import me_view, my_interest, require_opted_in, signal_view

router = APIRouter()


class OptIn(BaseModel):
    mode: str
    poolId: str | None = None


@router.post("/v1/optin", operation_id="optIn")
async def opt_in(body: OptIn, uid: User, base: Base):
    pools = [p for p in get_settings().contract("modes.yaml")["pools"] if p["mode"] == body.mode]
    pool_id = body.poolId or (pools[0]["poolId"] if pools else None)
    if pool_id not in {p["poolId"] for p in pools}:
        raise ApiError(400, "validation_failed", "That mode isn't available yet.")
    if not store.pool or pool_id != store.pool["poolId"]:
        # ponytail: one pool loaded at a time; switching pools live is M2 (load the other seed meanwhile).
        raise ApiError(409, "conflict", "That pool isn't open right now.")
    u = store.users[uid]
    if not u["optedIn"]:
        u.update(optedIn=True, mode=body.mode, poolId=pool_id)
        await seed.derive(uid)  # Facebook activity becomes usable after optIn
        realtime.emit(uid, "me.updated")
        realtime.emit(uid, "signals.updated")
    return me_view(uid, base)


@router.delete("/v1/optin", operation_id="optOut", status_code=204)
def opt_out(uid: User):
    u = store.users[uid]
    for j in store.joins.values():
        if j["userId"] == uid and j["status"] == "interested":
            j["status"] = "withdrawn"  # silent (P6)
            store.directives.get(uid, {}).get(j["joinId"], {}).update(desired="none")
    u.update(optedIn=False, setupComplete=False, mode=None, poolId=None, signals={}, connectors={}, busy=[])
    realtime.emit(uid, "me.updated")
    return Response(status_code=204)


@router.get("/v1/me/setup", operation_id="getSetup")
async def get_setup(uid: User, base: Base):
    u = require_opted_in(uid)
    interests = sorted(u["interests"].values(), key=lambda i: (-i["weight"], i["id"]))
    shown = [
        my_interest(i)["interest"]["label"] for i in interests if i["visibility"] == "shown" and not i["sensitive"]
    ]
    has_records = {r["provider"] for r in store.records.get(uid, [])}
    providers = get_settings().contract("connectors.yaml")["providers"]
    suggested = [p for p, spec in providers.items() if spec["status"] == "available" and p not in u["connectors"]
                 and (p == "device_calendar" or p in has_records)]  # fmt: skip
    return {
        "museText": await ports.copy.setup_review(uid, shown),
        "proposedInterests": [my_interest(i) for i in interests],
        "signals": [signal_view(s, base) for s in u["signals"].values()],
        "proposedGroupSize": u["groupSize"],
        "proposedTravel": u["travel"],
        "suggestedProviders": suggested,
    }


class SetupComplete(BaseModel):
    acceptedInterestIds: list[str]
    hiddenInterestIds: list[str]
    groupSize: GroupSize
    travel: Travel
    availability: list[Slot] | None = None
    profileVisibility: Literal["public", "private"]
    neighborhood: str | None = Field(default=None, max_length=80)


@router.post("/v1/me/setup", operation_id="completeSetup")
def complete_setup(body: SetupComplete, uid: User, base: Base):
    u = require_opted_in(uid)
    apply_profile(u, body)
    for iid in body.acceptedInterestIds:
        if iid in u["interests"]:
            # ponytail: showing a sensitive interest never opts it into overlap (no sharedSensitiveOptIn API yet; P4)
            u["interests"][iid]["visibility"] = "shown"
    for iid in body.hiddenInterestIds:
        if iid in u["interests"]:
            u["interests"][iid]["visibility"] = "hidden"
    u["setupComplete"] = True
    realtime.emit(uid, "me.updated")
    realtime.emit(uid, "feed.updated")  # first For you carousel is built by the feed on read
    return me_view(uid, base)
