"""getMe, updateMe, setInterestVisibility, removeInterest."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Response
from pydantic import BaseModel, Field, model_validator

from cg_api.deps import Base, User
from cg_api.errors import ApiError
from cg_api.store import store
from cg_api.store.bridge import changed
from cg_api.store.views import me_view, my_interest

router = APIRouter()

Day = Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


class GroupSize(BaseModel):
    min: int = Field(ge=2)
    max: int = Field(ge=2)

    @model_validator(mode="after")
    def _ordered(self):  # rejected before anything is written (400 validation_failed)
        if self.min > self.max:
            raise ValueError("group size minimum is above the maximum")
        return self


class Slot(BaseModel):
    day: Day
    part: Literal["morning", "afternoon", "evening"]


class Travel(BaseModel):
    maxMinutes: int = Field(ge=5)
    modes: list[Literal["transit", "walk", "bike", "drive"]] = Field(min_length=1)


class MuseSettings(BaseModel):
    spendWithoutAskingCents: int = Field(ge=0)
    autoReschedule: bool
    autoBackfill: bool
    calendarHolds: bool
    leaveByReminders: bool


class MeUpdate(BaseModel):
    profileVisibility: Literal["public", "private"] | None = None
    neighborhood: str | None = Field(default=None, max_length=80)
    groupSize: GroupSize | None = None
    availability: list[Slot] | None = None
    travel: Travel | None = None
    museSettings: MuseSettings | None = None


def apply_profile(u: dict, body: BaseModel) -> None:
    """Shared by updateMe and completeSetup: copy the provided fields onto the user. The body is already
    fully validated by its pydantic model, so this never fails halfway."""
    for k, v in body.model_dump(exclude_none=True).items():
        if k in ("profileVisibility", "neighborhood", "groupSize", "availability", "travel", "museSettings"):
            u[k] = v


@router.get("/v1/me", operation_id="getMe")
def get_me(uid: User, base: Base):
    return me_view(uid, base)


@router.patch("/v1/me", operation_id="updateMe")
def update_me(body: MeUpdate, uid: User, base: Base):
    apply_profile(store.users[uid], body)
    changed(uid, "me.updated")
    return me_view(uid, base)


class VisibilityBody(BaseModel):
    visibility: Literal["shown", "hidden"]


@router.put("/v1/me/interests/{interestId}", operation_id="setInterestVisibility")
def set_interest_visibility(interestId: str, body: VisibilityBody, uid: User):
    i = store.users[uid]["interests"].get(interestId)
    if not i:
        raise ApiError(404, "not_found", "That interest isn't on your profile.")
    i["visibility"] = body.visibility
    changed(uid, "me.updated")
    return my_interest(i)


@router.delete("/v1/me/interests/{interestId}", operation_id="removeInterest", status_code=204)
def remove_interest(interestId: str, uid: User):
    u = store.users[uid]
    if u["interests"].pop(interestId, None) is None:
        raise ApiError(404, "not_found", "That interest isn't on your profile.")
    u["removedInterests"].add(interestId)  # re-extraction never brings it back
    changed(uid, "me.updated")
    return Response(status_code=204)
