import math
import random

from conftest import export, plan, user, venue

import cg_matching as cgm


def snap(users, plans=()):
    return cgm.PoolSnapshot.from_export(export(users, plans))


def test_vectors_privacy_parents_idf(params):
    pool = snap(
        [
            user(
                "u_a",
                {
                    "arts_crafts.ceramics.wheel": 0.8,
                    "food_drink.coffee_tea": 0.6,
                    "games.board_games": {"weight": 0.9, "visibility": "hidden"},
                    "beliefs.faith": {"weight": 0.9, "sensitive": True},
                    "beliefs.meditation": {"weight": 0.7, "sensitive": True, "sharedSensitiveOptIn": True},
                },
            ),
            user("u_b", {"food_drink.coffee_tea": 0.6}),
            user("u_c", {"food_drink.coffee_tea": 0.6}),
        ]
    )
    raw = cgm.build_vectors(pool, cgm.Params(params | {"matching": params["matching"] | {"idf": False}}))
    a = raw["u_a"]
    assert "games.board_games" not in a and "beliefs.faith" not in a  # hidden, sensitive without opt-in
    assert a["beliefs.meditation"] == 0.7
    assert math.isclose(a["arts_crafts.ceramics"], 0.4) and math.isclose(a["arts_crafts"], 0.2)
    idf = cgm.build_vectors(pool, params)["u_a"]
    # The rare interest gets boosted relative to the one everybody has.
    assert idf["arts_crafts.ceramics.wheel"] / 0.8 > idf["food_drink.coffee_tea"] / 0.6


def test_candidates_filters(params):
    pool = snap(
        [
            user("u_a", {"x.y": 0.9}, blockedIds=["u_b"]),
            user("u_b", {"x.y": 0.9}),
            user("u_c", {"x.y": 0.8}),
            user("u_d", {"x.y": 0.9}, ageBand="30_34"),
            user("u_e", {"x.y": 0.9}, ageBand="30_34"),
            user("u_f", {"x.y": 0.9}, trustFloorOk=False),
            user("u_g", {"q.r": 0.9}),
        ]
    )
    c = cgm.candidates(pool, cgm.build_vectors(pool, params), params)
    assert [b for b, _ in c["u_a"]] == ["u_c"]  # blocked, 30_34, untrusted and dissimilar all out
    assert [b for b, _ in c["u_d"]] == ["u_e"]  # 30_34 pair within their own band
    assert c["u_f"] == [] and c["u_g"] == []


def test_travel_minutes(params):
    # 0.1 deg latitude = 11.119 km straight, x1.3 detour; transit 16 km/h + 8 min overhead.
    assert cgm.travel_minutes((37.7, -122.4), (37.8, -122.4), "transit", params) == math.ceil(
        11.119 * 1.3 / 16 * 60 + 8
    )
    assert cgm.travel_minutes((37.7, -122.4), (37.8, -122.4), "walk", params) > 60


def _rank(params, users, plans, venues=None, state=None, tables=None, seed=7):
    pool = snap(users)
    venues = venues or {"vn_clay": cgm.Venue.from_record(venue())}
    return cgm.rank_plans(
        pool,
        [cgm.Plan.from_record(p) for p in plans],
        cgm.build_vectors(pool, params),
        venues,
        tables or cgm.LayaTables(),
        state or cgm.MatchState(),
        params,
        random.Random(seed),
    )


def test_rank_hard_filters(params):
    makers = {"arts_crafts.ceramics": 0.9}
    users = [
        user("u_ok", makers),
        user("u_busy", makers, busy=[{"start": "2026-11-14T19:30:00Z", "end": "2026-11-14T21:00:00Z"}]),
        user("u_free", makers, busy=[{"start": "2026-11-14T22:00:00Z", "end": "2026-11-14T23:00:00Z"}]),
        user("u_far", makers, home=(38.5, -121.5)),
        user("u_seed", makers),
        user("u_big", makers, groupSize={"min": 8, "max": 8}),
        user("u_offday", makers, availability=[{"day": "mon", "part": "evening"}]),
        user("u_untrusted", makers, trustFloorOk=False),
        user("u_hiker", {"outdoors.hiking": 0.9}),
    ]
    out = _rank(params, users, [plan(seedJoinIds=["u_seed"]), plan("pl_inv", inviteeIds=["u_seed"])])
    got = {u: [s.plan_id for s in ss] for u, ss in out.items() if ss}
    assert got == {
        "u_ok": ["pl_wheel"],
        "u_free": ["pl_wheel"],
        "u_seed": ["pl_inv"],
    }  # invite-only stays private
    s = out["u_ok"][0]
    assert s.plan_id == "pl_wheel" and s.shared_coarse == ["arts_crafts.ceramics"] and s.travel_minutes > 0


def test_rank_exposure_cap_isolation_and_floor(params):
    cap = 3
    prm = cgm.Params(params | {"plans": params["plans"] | {"exposureCapPerDay": cap}})
    users = [user(f"u_{i:03d}", {"arts_crafts.ceramics": 0.9}, metIds=["u_zzz"]) for i in range(10)]
    users += [user("u_iso", {"arts_crafts.ceramics": 0.9})]
    out = _rank(prm, users, [plan()], state=cgm.MatchState(exposures={"pl_wheel": 1}))
    shown = [u for u, ss in out.items() if ss]
    assert len(shown) == cap - 1  # today's exposure counted
    assert "u_iso" in shown  # isolation boost wins a contested slot
    assert out["u_iso"][0].debug["isolated"] is True
    # A plan nobody wants enough to fill falls under fillLikelihoodFloor and disappears.
    cold = cgm.LayaTables(default=0.01)
    out = _rank(params, users[:2], [plan(size=(6, 8))], tables=cold)
    assert all(not ss for ss in out.values())


def test_rank_feed_caps_signal_and_determinism(params):
    v = {"vn_clay": cgm.Venue.from_record(venue()), "vn_b": cgm.Venue.from_record(venue("vn_b"))}
    plans = [plan(f"pl_{i}", vid="vn_b" if i == 4 else "vn_clay", sceneId=f"sc_{i}") for i in range(5)]
    sig = {
        "signalId": "si_1",
        "provider": "google_maps",
        "kind": "frequent_place",
        "interestIds": [],
        "venueId": "vn_b",
        "strength": 0.9,
        "visibility": "shown",
        "sensitive": False,
    }
    users = [user("u_a", {"arts_crafts.ceramics": 0.9}, signals=[sig])] + [
        user(f"u_{i}", {"arts_crafts.ceramics": 0.9}) for i in range(5)
    ]
    out = _rank(params, users, plans, venues=v)
    a = out["u_a"]
    assert len(a) == params["feed"]["maxPerActivityType"]  # all five are ceramics_studio
    assert a[0].plan_id == "pl_4" and a[0].debug["signal_ids"] == ["si_1"]
    assert out == _rank(params, users, plans, venues=v)


def _form(params, users, ids, p=None, state=None, tables=None):
    pool = snap(users)
    cands = cgm.candidates(pool, cgm.build_vectors(pool, params), params)
    return cgm.form_groups(
        cgm.Plan.from_record(p or plan(size=(3, 6))),
        ids,
        pool,
        cands,
        tables or cgm.LayaTables(),
        state or cgm.MatchState(),
        params,
        random.Random(7),
    )


MAKER = {"arts_crafts.ceramics": 0.9, "food_drink.coffee_tea": 0.5}


def test_form_balanced_split_and_min(params):
    users = [user(f"u_{i}", MAKER) for i in range(7)]
    ids = [u["userId"] for u in users]
    res = _form(params, users, ids)
    assert sorted(len(g.member_ids) for g in res.groups) == [3, 4] and res.unseated_ids == []
    res = _form(params, users[:2], ids[:2], p=plan(size=(2, 6)))
    assert res.groups == [] and res.unseated_ids == ids[:2]  # strangers never below strangerSizeMin
    assert _form(params, users, ids) == _form(params, users, ids)  # deterministic


def test_form_blocks_capacity_priority_and_size_pref(params):
    users = [user(f"u_{i}", MAKER, metIds=["u_x"]) for i in range(6)]
    users.append(user("u_late", MAKER))  # isolated, joined last
    users[0]["blockedIds"] = ["u_1"]
    ids = [u["userId"] for u in users]
    res = _form(params, users, ids, state=cgm.MatchState(venue_capacity={"vn_clay": 4}))
    seated = [m for g in res.groups for m in g.member_ids]
    assert len(seated) == 4 and "u_late" in seated  # isolated seated first despite joining last
    for g in res.groups:
        assert not {"u_0", "u_1"} <= set(g.member_ids)
    small = [user(f"u_{i}", MAKER, groupSize={"min": 3, "max": 3}) for i in range(6)]
    res = _form(params, small, [u["userId"] for u in small])
    assert [len(g.member_ids) for g in res.groups] == [3, 3]


def test_form_min_shared_with_others(params):
    users = [user(f"u_{i}", MAKER) for i in range(3)] + [user("u_odd", {"outdoors.hiking": 0.9})]
    res = _form(params, users, [u["userId"] for u in users])
    assert res.unseated_ids == ["u_odd"] and len(res.groups[0].member_ids) == 3


def test_shared_interests_and_plan_overlap(params):
    a = user(
        "u_a",
        {
            "arts_crafts.ceramics.wheel": 0.9,
            "food_drink.coffee_tea.matcha": 0.5,
            "games.board_games": {"weight": 0.9, "visibility": "hidden"},
            "beliefs.faith": {"weight": 0.9, "sensitive": True, "sharedSensitiveOptIn": True},
        },
    )
    b = user(
        "u_b",
        {
            "arts_crafts.ceramics.wheel": 0.8,
            "food_drink.coffee_tea.matcha": 0.9,
            "games.board_games": 0.9,
            "beliefs.faith": {"weight": 0.9, "sensitive": True},  # not opted in: P4
        },
    )
    c = user("u_c", {"arts_crafts.ceramics": 0.7})
    pool = snap([a, b, c])
    assert cgm.shared_interests(pool, "u_a", "u_b", 3, 8) == [
        "arts_crafts.ceramics.wheel",
        "food_drink.coffee_tea.matcha",
    ]
    assert cgm.shared_interests(pool, "u_a", "u_b", 2, 1) == ["arts_crafts.ceramics"]
    p = cgm.Plan.from_record(plan())
    assert cgm.plan_overlap(pool, "u_a", p, ["u_b"], 2, 3, params=params) == []  # below crowdMinCount
    assert cgm.plan_overlap(pool, "u_a", p, ["u_a", "u_b", "u_c"], 2, 3, params=params) == [
        ("arts_crafts.ceramics", 2),
        ("food_drink.coffee_tea", 1),
    ]


def _with(params, **kw):
    return cgm.Params(params | {"matching": params["matching"] | kw})


def _reunion_world():
    v = {
        "vn_clay": cgm.Venue.from_record(venue()),
        "vn_cafe": cgm.Venue.from_record(venue("vn_cafe", types=("coffee",))),
    }
    plans = [
        plan("pl_a", sceneId="sc_a"),
        plan(
            "pl_b",
            at="coffee",
            vid="vn_cafe",
            targets=["food_drink.coffee_tea"],
            sceneId="sc_b",
            seedJoinIds=["u_v"],
        ),
    ]
    users = [user("u_u", MAKER, metIds=["u_v"]), user("u_v", MAKER), user("u_w", MAKER, metIds=["u_z"])]
    return users, plans, v


def test_reunion_zero_is_identity(params):
    users, plans, v = _reunion_world()
    for prm in (_with(params, reunionBoost=0.0, crowdBoost=0.0), _with(params, reunionBoost=0)):
        assert _rank(prm, users, plans, venues=v) == _rank(params, users, plans, venues=v)
    ids = [f"u_{i}" for i in range(8)]
    us = [user(u, MAKER, metIds=["u_x"]) for u in ids]
    st = cgm.MatchState(met_pairs=[["u_0", "u_7"]])
    zero = _with(params, reunionBoost=0.0)
    assert _form(zero, us, ids, p=plan(size=(3, 4)), state=st) == _form(
        params, us, ids, p=plan(size=(3, 4)), state=st
    )


def test_rank_reunion_lifts_plan_with_met_joiner(params):
    users, plans, v = _reunion_world()
    ids = lambda out, u: [s.plan_id for s in out[u]]  # noqa: E731
    before = _rank(params, users, plans, venues=v)
    assert ids(before, "u_u") == ids(before, "u_w") == ["pl_a", "pl_b"]
    after = _rank(_with(params, reunionBoost=1.0), users, plans, venues=v)
    assert ids(after, "u_u") == ["pl_b", "pl_a"] and after["u_u"][0].debug["reunion"] is True
    assert after["u_w"] == before["u_w"]  # never met anyone going: unchanged
    crowd = _rank(_with(params, crowdBoost=4.0), users, plans, venues=v)
    assert ids(crowd, "u_w") == ["pl_b", "pl_a"]  # fallback: concentration on the plan already filling


def test_form_keeps_met_pair_together(params):
    ids = [f"u_{i}" for i in range(8)]
    us = [user(u, MAKER, metIds=["u_x"]) for u in ids]  # nobody isolated: queue is join order
    st = cgm.MatchState(met_pairs=[["u_0", "u_7"]])

    def together(prm):
        res = _form(prm, us, ids, p=plan(size=(3, 4)), state=st)
        assert len(res.groups) == 2
        return any({"u_0", "u_7"} <= set(g.member_ids) for g in res.groups)

    assert not together(params) and together(_with(params, reunionBoost=1.0))
    fixed = cgm.MatchState(met_pairs=[["u_0", "u_7"]], fixed_ids={"pl_wheel": ["u_0", "u_1"]})
    res = _form(_with(params, reunionBoost=1.0), us, ids[2:], p=plan(size=(3, 4)), state=fixed)
    assert "u_7" in res.groups[0].member_ids  # backfill pulls the met person in first


def test_fill_to_max(params):
    ids = [f"u_{i}" for i in range(8)]
    us = [user(u, MAKER, groupSize={"min": 3, "max": 6}) for u in ids]
    p = plan(size=(3, 6))
    assert _form(_with(params, fillToMax=False), us, ids, p=p) == _form(params, us, ids, p=p)  # default off
    assert [len(g.member_ids) for g in _form(params, us, ids, p=p).groups] == [4, 4]
    res = _form(_with(params, fillToMax=True), us, ids, p=p)
    assert [g.member_ids for g in res.groups] == [ids[:6]] and res.unseated_ids == ids[6:]  # 6 + backfill
    # 11 people: 6 + 5. Members' own max still holds: a max-4 person caps their group.
    ids = [f"u_{i}" for i in range(11)]
    us = [user(u, MAKER, groupSize={"min": 3, "max": 4 if u == "u_0" else 6}) for u in ids]
    res = _form(_with(params, fillToMax=True), us, ids, p=p)
    caps = {u["userId"]: u["groupSize"]["max"] for u in us}
    assert all(len(g.member_ids) <= caps[m] for g in res.groups for m in g.member_ids)
    assert sorted([m for g in res.groups for m in g.member_ids] + res.unseated_ids) == sorted(ids)
    us = [user(u, MAKER, groupSize={"min": 3, "max": 6}) for u in ids]
    res = _form(_with(params, fillToMax=True), us, ids, p=p)
    assert [len(g.member_ids) for g in res.groups] == [6, 5] and res.unseated_ids == []
