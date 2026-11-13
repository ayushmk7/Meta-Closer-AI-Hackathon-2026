"""getPublicPlan vs CONTRACTS §8, one test per line of the batch 5 privacy analysis (plan §D)."""

import json

import pytest
from fastapi.testclient import TestClient

from cg_api import contracts
from cg_api.domain import joins, people, public
from cg_api.domain.world import Fail

KEYS = set(contracts.doc(contracts.PUBLIC)["components"]["schemas"]["PublicPlan"]["required"])


def get(w, plan_id="pl_hero"):
    return public.public_plan(w, plan_id)


def test_p1_p2_keys_exactly_public_plan(world):
    out = get(world)
    assert set(out) == KEYS
    assert set(out["venue"]) == {"venueId", "name", "neighborhood"}


def test_p2_count_gated_by_crowd_min(world):
    world.params["privacy"]["crowdMinCount"] = 3
    assert get(world)["interestedCount"] == 0  # 2 seed joins, below the gate
    joins.join(world, "u_kai", "pl_hero")
    assert get(world)["interestedCount"] == 3


def test_p9_nothing_viewer_specific(world):
    before = get(world)
    people.block(world, "u_maya", "u_dan")
    assert get(world) == before


def test_p3_p5_no_person_anywhere(world):
    joins.join(world, "u_maya", "pl_hero")  # forms the group
    dump = json.dumps([get(world, p) for p in ("pl_hero", "pl_hero2", "pl_walk")])
    for uid, u in world.users.items():
        assert uid not in dump
        assert u["displayName"].split()[0] not in dump


def test_p4_sensitive_venue_404(world):
    world.venues["vn_clay"]["sensitive"] = True
    with pytest.raises(Fail) as e:
        get(world)
    assert e.value.status == 404


@pytest.mark.parametrize(
    "change",
    [
        lambda w: w.plans["pl_hero"].update(status="cancelled"),  # P6
        lambda w: w.plans["pl_hero"].update(origin="invite", inviteUserIds=["u_dan"]),
        lambda w: w.params["features"].update(sharing=False),
        lambda w: w.plans.pop("pl_hero"),
    ],
    ids=["cancelled", "invite", "flag_off", "unknown"],
)
def test_hidden_plans_404_like_unknown(world, change):
    change(world)
    with pytest.raises(Fail) as e:
        get(world)
    assert (e.value.status, e.value.code) == (404, "not_found")


def test_p7_p8_no_owner_or_location_fields(world):
    dump = json.dumps(get(world))
    for k in ("because", "reason", "checks", "travel", "myJoin", "crowd", "address", "location", "directions", "lat"):
        assert f'"{k}"' not in dump


def test_user_plan_title_is_template(world):
    world.plans["pl_walk"].update(origin="user", title="Walk with Maya Chen")
    assert get(world, "pl_walk")["title"] == "Walk at Lands End Trail"


def test_http_same_with_and_without_identity(apps):
    anon = TestClient(apps[0])
    r = anon.get("/v1/public/plans/pl_sf_hero_wheel")
    assert r.status_code == 200, r.text
    contracts.validate(contracts.op_by_id("getPublicPlan"), 200, r.json())
    assert anon.get("/v1/public/plans/pl_sf_hero_wheel", headers={"X-CG-User": "u_maya"}).json() == r.json()
