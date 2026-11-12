import json
import random
from pathlib import Path

from conftest import PARAMS, export, plan, user, venue

import cg_matching as cgm

GOLDEN = Path(__file__).parent / "golden_rank.json"


def world(prefs=None):
    """Fixed pool: 30 people split between climbing and ceramics, 3 venues, 6 plans."""
    r = random.Random(11)
    users = [
        user(
            f"u_{i:03d}",
            {
                "outdoors.climbing.bouldering": round(0.4 + r.random() * 0.6, 2),
                "arts_crafts.ceramics": round(0.4 + r.random() * 0.6, 2),
                "food_drink.coffee_tea": round(r.random(), 2),
            },
            home=(37.76 + r.random() * 0.03, -122.44 + r.random() * 0.03),
            metIds=["u_x"] if i % 3 else [],
        )
        for i in range(30)
    ]
    venues = {
        v["venueId"]: cgm.Venue.from_record(v)
        for v in (
            venue("vn_clay"),
            venue("vn_wall", types=("climbing_session",)),
            venue("vn_cafe", types=("coffee",)),
        )
    }
    plans = [
        plan("pl_clay_a"),
        plan("pl_clay_b", startsAt="2026-11-14T22:00:00Z", endsAt="2026-11-15T00:00:00Z"),
        plan("pl_wall_a", at="climbing_session", vid="vn_wall", targets=["outdoors.climbing"]),
        plan(
            "pl_wall_b",
            at="climbing_session",
            vid="vn_wall",
            targets=["outdoors.climbing.bouldering"],
            startsAt="2026-11-15T02:00:00Z",
            endsAt="2026-11-15T04:00:00Z",
        ),
        plan("pl_cafe", at="coffee", vid="vn_cafe", targets=["food_drink.coffee_tea"]),
        plan("pl_cafe_b", at="coffee", vid="vn_cafe", targets=["food_drink.coffee_tea"], size=(3, 6)),
    ]
    plans = [p | {"sceneId": f"sc_{k}"} for k, p in enumerate(plans)]
    pool = cgm.PoolSnapshot.from_export(export(users))
    params = cgm.Params.from_yaml(PARAMS)
    out = cgm.rank_plans(
        pool,
        [cgm.Plan.from_record(p) for p in plans],
        cgm.build_vectors(pool, params),
        venues,
        cgm.LayaTables(),
        cgm.MatchState(exposures={"pl_cafe": 5}, prefs=prefs or {}),
        params,
        random.Random(7),
    )
    return {u: [s.to_dict() for s in ss] for u, ss in out.items()}


def test_empty_prefs_golden():
    got = json.dumps(world(), sort_keys=True, indent=1)
    assert got == GOLDEN.read_text()


def test_update_prefs_math():
    p0 = {"act:coffee": 0.5, "vn:vn_old": 0.2}
    p1 = cgm.update_prefs(p0, ["act:coffee", "vn:vn_cafe"], 1.0, 0.3)
    assert p0 == {"act:coffee": 0.5, "vn:vn_old": 0.2}  # pure
    assert p1 == {"act:coffee": 0.65, "vn:vn_cafe": 0.3, "vn:vn_old": 0.2}
    assert cgm.update_prefs(p1, ["act:coffee"], -5.0, 1.0)["act:coffee"] == -1.0  # clamped to [-1, 1]
    assert cgm.update_prefs(p1, ["act:coffee"], 1.0, 7.0)["act:coffee"] == 1.0  # alpha clamped to [0, 1]
    for bad in (float("nan"), float("inf")):
        assert cgm.update_prefs(p1, ["act:coffee"], bad, 0.3) == p1  # missing rating counts for nothing
        assert cgm.update_prefs(p1, ["act:coffee"], 1.0, bad) == p1


def test_five_star_bouldering_moves_bouldering_up():
    before = world()
    # 5 stars -> r = (5 - 3) / 2 = 1.0 on the meetup's keys.
    keys = ["act:climbing_session", "vn:vn_wall", "int:outdoors.climbing"]
    prefs = {u: cgm.update_prefs({}, keys, 1.0, 0.3) for u in before}
    after = world(prefs)

    def rank_of(feed, u):
        return [s["plan_id"] for s in feed[u]]

    moved = 0
    for u in before:
        b, a = rank_of(before, u), rank_of(after, u)
        for pid in ("pl_wall_a", "pl_wall_b"):
            if pid in b and pid in a:
                assert a.index(pid) <= b.index(pid)
                moved += a.index(pid) < b.index(pid)
    assert moved > 0
    s = next(s for ss in after.values() for s in ss if s["plan_id"] == "pl_wall_a")
    assert s["debug"]["pref_keys"][0] in keys and s["score"] > 0
    assert all("pref_keys" not in s["debug"] for ss in before.values() for s in ss)  # empty prefs: no field


def test_pref_keys_lists_negative_keys_that_applied():
    prefs = {u: {"act:climbing_session": -0.6, "vn:vn_wall": 0.2} for u in world()}
    s = next(s for ss in world(prefs).values() for s in ss if s["plan_id"] == "pl_wall_a")
    assert s["debug"]["pref_keys"] == ["vn:vn_wall", "act:climbing_session"]


def test_pref_keys_skip_sensitive():
    v = cgm.Venue.from_record(venue("vn_x", sensitive=True))
    p = cgm.Plan.from_record(plan(vid="vn_x"))
    assert cgm.core.plan_pref_keys(p, v) == ["act:ceramics_studio", "int:arts_crafts.ceramics"]
