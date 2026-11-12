import random
from datetime import timedelta

from conftest import NOW, export, plan, user, venue
from test_match import MAKER, _form

import cg_matching as cgm

HIKER = {"outdoors.hiking": 0.9, "outdoors.nature": 0.6}


def _pool(users):
    return cgm.PoolSnapshot.from_export(export(users))


def test_scenes_leiden_two_clusters(params):
    users = [user(f"u_m{i}", MAKER) for i in range(6)] + [user(f"u_h{i}", HIKER) for i in range(6)]
    users.append(user("u_lone", {"q.r": 1.0}))
    pool = _pool(users)
    cands = cgm.candidates(pool, cgm.build_vectors(pool, params), params)
    sc = cgm.scenes(pool, cands, params, seed=7)
    assert sc == cgm.scenes(pool, cands, params, seed=7)
    assert {sc[f"u_m{i}"] for i in range(6)} == {"sc_ceramics_coffee_tea"}
    assert {sc[f"u_h{i}"] for i in range(6)} == {"sc_hiking_nature"}
    assert "u_lone" not in sc


def test_propose_plans(params):
    users = [user(f"u_m{i}", MAKER) for i in range(5)]
    sig = {
        "signalId": "si_1",
        "provider": "google_maps",
        "kind": "frequent_place",
        "interestIds": ["outdoors.hiking"],
        "venueId": "vn_trail",
        "strength": 0.9,
        "visibility": "shown",
        "sensitive": False,
    }
    users.append(user("u_h0", HIKER, signals=[sig]))
    pool = _pool(users)
    scene_of = {f"u_m{i}": "sc_makers" for i in range(5)}
    venues = [
        cgm.Venue.from_record(venue("vn_clay", hours=[{"day": "sat", "open": "13:00", "close": "17:00"}])),
        cgm.Venue.from_record(venue("vn_cafe", types=("coffee", "board_game_night"))),
        cgm.Venue.from_record(venue("vn_church", types=("coffee",), sensitive=True)),
        cgm.Venue.from_record(venue("vn_trail", types=("hike", "walk"))),
    ]
    out = cgm.propose_plans(pool, venues, scene_of, params, random.Random(3), NOW)
    assert out == cgm.propose_plans(pool, venues, scene_of, params, random.Random(3), NOW)
    assert len({p.plan_id for p in out}) == len(out)
    seed = [p for p in out if p.origin == "seed"]
    assert len(seed) <= params["plans"]["proposalsPerSceneWeek"]
    assert {p.activity_type for p in seed} == {"ceramics_studio", "coffee"}
    assert all(p.venue_id != "vn_church" for p in out)
    lo = NOW + timedelta(hours=params["plans"]["minLeadHours"])
    assert all(lo <= p.starts_at <= NOW + timedelta(days=params["plans"]["horizonDays"]) for p in out)
    clay = next(p for p in seed if p.venue_id == "vn_clay")
    assert clay.starts_at.astimezone(cgm.core.TZ).strftime("%a %H") == "Sat 14"  # only in opening hours
    assert clay.target_interest_ids == ("arts_crafts.ceramics",) and clay.cost["perPersonCents"] == 3500
    (sp,) = [p for p in out if p.origin == "signal"]
    assert (sp.venue_id, sp.activity_type) == ("vn_trail", "hike")
    rec = sp.to_record()
    assert (
        cgm.Plan.from_record(rec | {"title": "t", "description": "d", "poolId": "pool_test"}).plan_id
        == sp.plan_id
    )


def test_backfill_with_fixed_members(params):
    users = [user(f"u_{i}", MAKER) for i in range(3)]
    users += [user("u_blocker", MAKER, blockedIds=["u_0"]), user("u_new", MAKER), user("u_odd", HIKER)]
    ids = ["u_blocker", "u_odd", "u_new"]
    st = cgm.MatchState(fixed_ids={"pl_wheel": ["u_0", "u_1"]})
    res = _form(params, users, ids, p=plan(size=(3, 6)), state=st)
    (g,) = res.groups
    assert g.member_ids == ["u_0", "u_1", "u_new"]  # blocked and no-shared-interest people skipped
    assert res.unseated_ids == ["u_blocker", "u_odd"]
