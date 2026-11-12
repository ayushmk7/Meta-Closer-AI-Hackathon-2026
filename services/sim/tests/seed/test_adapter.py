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
    pool = {"users": [{"userId": u, "metIds": [], "blockedIds": ["u_b"] if u == "u_a" else []} for u in
                      ("u_a", "u_b", "u_c", "u_d")]}
    cands = {a: [(b, 0.5) for b in ("u_a", "u_b", "u_c", "u_d") if b != a] for a in ("u_a", "u_b", "u_c", "u_d")}
    plan = {"planId": "pl_x", "size": {"min": 3, "max": 4}}
    res = form_groups(plan, ["u_a", "u_b", "u_c", "u_d"], pool, cands, None, {}, p, random.Random(1))
    for g in res["groups"]:
        assert not {"u_a", "u_b"} <= set(g["member_ids"])
