import json
import random

from cg_sim.contracts import data_dir, params
from cg_sim.matching_adapter import build_vectors, candidates, form_groups, rank_plans
from cg_sim.seed.generate import ground_truth_export

POOL = "pool_evt_closer_together"


def _load(sub, name):
    return [json.loads(x) for x in (data_dir() / sub / POOL / name).read_text().splitlines()]


def test_rank_and_form_on_committed_seed():
    p = params()
    export = ground_truth_export(POOL, _load("seed", "personas.jsonl"), _load("sim_private", "ground_truth.jsonl"),
                                 _load("seed", "connectors.jsonl"))
    plans = _load("seed", "plans.jsonl")
    venues = {v["venueId"]: v for v in _load("seed", "venues.jsonl")}
    vec = build_vectors(export, p)
    cands = candidates(export, vec, p)
    ranked = rank_plans(export, plans, vec, venues, None, {}, p, random.Random(7))
    assert sum(len(v) for v in ranked.values()) > 0
    assert all(len(v) <= p["feed"]["size"] for v in ranked.values())
    s = next(s for v in ranked.values() for s in v)
    assert set(s) == {"user_id", "plan_id", "score", "shared_coarse", "travel_minutes", "debug"}

    plan = plans[0]
    interested = [u for u, ss in ranked.items() if any(x["plan_id"] == plan["planId"] for x in ss)]
    interested = (interested + [u["userId"] for u in export["users"]])[:11]
    res = form_groups(plan, interested, export, cands, None, {}, p, random.Random(7))
    seated = [m for g in res["groups"] for m in g["member_ids"]]
    assert sorted(seated + res["unseated_ids"]) == sorted(set(interested))
    assert all(plan["size"]["min"] <= len(g["member_ids"]) <= plan["size"]["max"] for g in res["groups"])


def test_form_groups_respects_blocks():
    p = params()
    games = [{"id": "games.board_games.party_games", "sensitive": False}]
    pool = {"users": [{"userId": u, "metIds": [], "interests": games, "blockedIds": ["u_b"] if u == "u_a" else []}
                      for u in ("u_a", "u_b", "u_c", "u_d")]}
    cands = {a: [(b, 0.5) for b in ("u_a", "u_b", "u_c", "u_d") if b != a] for a in ("u_a", "u_b", "u_c", "u_d")}
    plan = {"planId": "pl_x", "size": {"min": 3, "max": 4}}
    res = form_groups(plan, ["u_a", "u_b", "u_c", "u_d"], pool, cands, None, {}, p, random.Random(1))
    for g in res["groups"]:
        assert not {"u_a", "u_b"} <= set(g["member_ids"])


def test_ground_truth_export_api():
    from jsonschema import Draft202012Validator
    from referencing import Registry, Resource

    from cg_sim.contracts import schemas
    from cg_sim.seed.export import ground_truth_signals, load_ground_truth_export

    sig = ground_truth_signals("pool_sf_city")
    assert sig["u_maya"]["frequentPlaces"] == ["vn_lands_end"] and sig["u_maya"]["sensitivePlace"]
    assert sum(bool(s["sensitivePlace"]) for s in sig.values()) >= 25
    export = load_ground_truth_export("pool_sf_city")
    reg = Registry()
    for n, s in schemas().items():
        reg = reg.with_resource(n, Resource.from_contents(s))
    assert list(Draft202012Validator(schemas()["pool_export.schema.json"], registry=reg).iter_errors(export)) == []
    flat = [s for u in export["users"] for s in u["signals"]]
    assert any(s["kind"] == "routine" for s in flat) and any(s["sensitive"] for s in flat)
    assert all(s["visibility"] == "hidden" for s in flat if s["sensitive"])


def _user(uid, met=(), l2=("games.board_games",), start="2026-11-14T18:00:00Z"):
    return {"userId": uid, "metIds": list(met), "busy": [], "availability": [{"day": "sat", "part": "morning"}],
            "homeLocation": {"lat": 37.77, "lng": -122.42}, "travel": {"maxMinutes": 60, "modes": ["walk"]},
            "interests": [{"id": f"{x}.leaf", "weight": 0.9, "visibility": "shown", "sensitive": False} for x in l2]}


def _plan(pid, at="board_game_night", scene="sc_a", joins=(), size=(3, 6)):
    return {"planId": pid, "activityType": at, "venueId": "vn_x", "startsAt": "2026-11-14T18:00:00Z",
            "endsAt": "2026-11-14T20:00:00Z", "size": {"min": size[0], "max": size[1]}, "sceneId": scene,
            "targetInterestIds": ["games.board_games"], "seedJoinIds": list(joins)}


VENUES = {"vn_x": {"location": {"lat": 37.77, "lng": -122.42}}}


class Tables:
    def __init__(self, pj):
        self.pj = pj

    def p_join(self, u, t):
        return self.pj


def _rank(users, plans, tables=None, **over):
    p = json.loads(json.dumps(params()))
    for k, v in over.items():
        sec, key = k.split("__")
        p[sec][key] = v
    pool = {"mode": "city", "users": users}
    return rank_plans(pool, plans, None, VENUES, tables, {}, p, random.Random(3))


def test_rank_fill_likelihood_floor():
    users = [_user("u_a")]
    # 1 eligible user x p_join 0.1, no seed joins: expected 0.1 of min 3 -> below floor, dropped.
    assert _rank(users, [_plan("pl_lo")], Tables(0.1))["u_a"] == []
    # Two seed joins lift it over the floor.
    assert [s["plan_id"] for s in _rank(users, [_plan("pl_hi", joins=["u_x", "u_y"])], Tables(0.1))["u_a"]] == ["pl_hi"]


def test_rank_exposure_cap_has_no_id_bias():
    users = [_user(f"u_{i:03d}", met=["u_zzz"]) for i in range(40)]
    winners = set()
    for seed in range(20):
        p = json.loads(json.dumps(params()))
        p["plans"]["exposureCapPerDay"] = 1
        out = rank_plans({"mode": "city", "users": users}, [_plan("pl_one")], None, VENUES, None, {}, p,
                         random.Random(seed))
        winners |= {u for u, ss in out.items() if ss}
    assert len(winners) > 5 and winners != {"u_000"}


def test_rank_diversity_caps():
    plans = [_plan(f"pl_{k}", at="board_game_night" if k < 3 else "trivia_night", scene=f"sc_{k % 2}") for k in range(6)]
    picked = _rank([_user("u_a")], plans, feed__maxPerActivityType=2, feed__maxPerScene=2)["u_a"]
    by = {p["planId"]: p for p in plans}
    from collections import Counter

    assert max(Counter(by[s["plan_id"]]["activityType"] for s in picked).values()) <= 2
    assert max(Counter(by[s["plan_id"]]["sceneId"] for s in picked).values()) <= 2


def test_rank_isolated_users_get_capped_plans_first():
    users = [_user("u_a", met=["u_z"]), _user("u_b", met=["u_z"]), _user("u_zz")]  # u_zz isolated, highest id
    out = _rank(users, [_plan("pl_one")], plans__exposureCapPerDay=1)
    assert [u for u, ss in out.items() if ss] == ["u_zz"]


def test_form_groups_min_shared_with_others():
    users = [_user("u_a"), _user("u_b"), _user("u_c"), _user("u_d", l2=("music.listening",))]
    pool = {"users": users}
    cands = {a["userId"]: [(b["userId"], 0.5) for b in users if b is not a] for a in users}
    res = form_groups(_plan("pl_x", size=(3, 4)), ["u_d", "u_a", "u_b", "u_c"], pool, cands, None, {}, params(),
                      random.Random(1))
    assert [g["member_ids"] for g in res["groups"]] == [["u_a", "u_b", "u_c"]] and res["unseated_ids"] == ["u_d"]


def test_rank_signal_boost_orders_signal_venue_first():
    u = _user("u_a")
    u["signals"] = [{"signalId": "si_1", "provider": "google_maps", "kind": "frequent_place", "interestIds": [],
                     "venueId": "vn_y", "strength": 0.8, "visibility": "shown", "sensitive": False}]
    venues = dict(VENUES, vn_y=VENUES["vn_x"])
    plans = [_plan("pl_a", scene="sc_a"), dict(_plan("pl_b", at="trivia_night", scene="sc_b"), venueId="vn_y")]
    p = params()
    out = rank_plans({"mode": "city", "users": [u]}, plans, None, venues, None, {}, p, random.Random(3))["u_a"]
    assert [s["plan_id"] for s in out] == ["pl_b", "pl_a"]  # same fit; signal venue wins only via signalBoost
    u["signals"][0]["sensitive"] = True  # P4: sensitive signals never boost
    out = rank_plans({"mode": "city", "users": [u]}, plans, None, venues, None, {}, p, random.Random(3))["u_a"]
    assert [s["plan_id"] for s in out] == ["pl_a", "pl_b"]


def test_real_cg_matching_branch_builds_contract_types(monkeypatch, tmp_path):
    """Stub cg_matching: the adapter must hand it MatchState / LayaTables / Plan objects, and return dicts."""
    import dataclasses
    import types

    from cg_sim import matching_adapter as ma

    seen = {}

    @dataclasses.dataclass
    class MatchState:
        exposures: dict = dataclasses.field(default_factory=dict)
        blocked_pairs: list = dataclasses.field(default_factory=list)

    class LayaTables:
        def __init__(self, path):
            self.path = path

        @classmethod
        def from_dir(cls, path):
            return cls(path)

    @dataclasses.dataclass
    class PlanScore:
        user_id: str
        plan_id: str
        score: float

    @dataclasses.dataclass
    class GroupResult:
        plan_id: str
        member_ids: list
        min_pairwise: float

    @dataclasses.dataclass
    class FormResult:
        groups: list
        unseated_ids: list

    wrap = lambda kind: type(kind, (), {"from_record": staticmethod(lambda d: (kind, d))})  # noqa: E731

    def rank(pool, plans, vectors, venues, tables, state, params, rng):
        seen["rank"] = (plans, venues, tables, state)
        return {"u_a": [PlanScore("u_a", "pl_x", 1.0)]}

    def form(plan, ids, pool, cands, tables, state, params, rng):
        seen["form"] = (plan, tables, state)
        return FormResult([GroupResult("pl_x", ids, 0.5)], [])

    stub = types.SimpleNamespace(
        MatchState=MatchState, LayaTables=LayaTables, Plan=wrap("Plan"), Venue=wrap("Venue"),
        PoolSnapshot=type("PoolSnapshot", (), {"from_export": staticmethod(lambda d: "snap")}),
        Params=type("Params", (), {"from_yaml": staticmethod(lambda p: "params")}),
        build_vectors=lambda snap, prm: "vectors", rank_plans=rank, form_groups=form,
    )
    monkeypatch.setattr(ma, "_cgm", stub)
    monkeypatch.setattr(ma, "HAVE_MATCHING", True)

    out = ma.rank_plans({}, [{"planId": "pl_x"}], None, {"vn_x": {}}, str(tmp_path),
                        {"exposures": {"pl_x": 2}, "blockedPairs": [["u_a", "u_b"]]}, {}, random.Random(1))
    plans, venues, tables, state = seen["rank"]
    assert out == {"u_a": [{"user_id": "u_a", "plan_id": "pl_x", "score": 1.0}]}
    assert plans[0][0] == "Plan" and venues["vn_x"][0] == "Venue"
    assert isinstance(tables, LayaTables) and str(tables.path) == str(tmp_path)
    assert state == MatchState(exposures={"pl_x": 2}, blocked_pairs=[["u_a", "u_b"]])

    res = ma.form_groups({"planId": "pl_x"}, ["u_a", "u_b"], {}, {}, None, MatchState(), {}, random.Random(1))
    assert res == {"groups": [{"plan_id": "pl_x", "member_ids": ["u_a", "u_b"], "min_pairwise": 0.5}],
                   "unseated_ids": []}
    assert seen["form"][1] is None and seen["form"][2] == MatchState()
