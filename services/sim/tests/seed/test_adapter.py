import json
import random

from cg_sim import matching_adapter as ma
from cg_sim.contracts import data_dir, params

POOL = "pool_evt_closer_together"


def _load(sub, name):
    return [json.loads(x) for x in (data_dir() / sub / POOL / name).read_text().splitlines()]


def _world():
    from cg_sim.seed.export import load_ground_truth_export

    return load_ground_truth_export(POOL), _load("seed", "plans.jsonl"), {v["venueId"]: v for v in _load("seed", "venues.jsonl")}


def test_shim_rank_and_form_on_committed_seed():
    p = params()
    export, plans, venues = _world()
    vec = ma.build_vectors(export, p)
    cands = ma.candidates(export, vec, p)
    ranked = ma.rank_plans(export, plans, vec, venues, None, {}, p, random.Random(7))
    s = next(s for v in ranked.values() for s in v)
    assert set(s) == {"user_id", "plan_id", "score", "shared_coarse", "travel_minutes", "debug"}
    assert all(len(v) <= p["feed"]["size"] for v in ranked.values())
    plan = plans[0]
    interested = [u["userId"] for u in export["users"]][:11]
    res = ma.form_groups(plan, interested, export, cands, None, {}, p, random.Random(7))
    assert set(res) == {"groups", "unseated_ids"}
    seated = [m for g in res["groups"] for m in g["member_ids"]]
    assert set(seated) | set(res["unseated_ids"]) <= set(interested) | set(plan.get("seedJoinIds", []))


def test_shim_converts_state_and_tables(tmp_path):
    st = ma._state({"exposures": {"pl_x": 2}, "metPairs": [["u_a", "u_b"]], "seat_history": {"u_a": 1}})
    assert st.exposures == {"pl_x": 2} and st.met_pairs == [["u_a", "u_b"]] and st.seat_history == {"u_a": 1}
    assert ma._state(st) is st
    assert ma._tables(None).p_join("u_a", "coffee") == ma._cgm.LayaTables().default
    import pyarrow as pa
    import pyarrow.parquet as pq

    pq.write_table(pa.table({"user_id": ["u_a"], "activity_type": ["coffee"], "p_join": [0.9], "p_show": [0.8]}),
                   tmp_path / "activity.parquet")
    pq.write_table(pa.table({"user_a": ["u_a"], "user_b": ["u_b"], "p_meet_again": [0.7]}), tmp_path / "meet_again.parquet")
    t = ma._tables(str(tmp_path))
    assert t.p_join("u_a", "coffee") == 0.9 and t.p_meet_again("u_a", "u_b") == 0.7


def test_shim_exposure_state_reaches_cg_matching():
    """A plan already at today's exposure cap (state dict) is shown to nobody."""
    p = params()
    export, plans, venues = _world()
    before = ma.rank_plans(export, plans, None, venues, None, {}, p, random.Random(7))
    shown = {s["plan_id"] for v in before.values() for s in v}
    pid = sorted(shown)[0]
    capped = ma.rank_plans(export, plans, None, venues, None, {"exposures": {pid: p["plans"]["exposureCapPerDay"]}},
                           p, random.Random(7))
    assert pid not in {s["plan_id"] for v in capped.values() for s in v}


def test_ground_truth_export_api():
    from jsonschema import Draft202012Validator
    from referencing import Registry, Resource

    from cg_sim.contracts import schemas
    from cg_sim.seed.export import ground_truth_signals, load_ground_truth_export

    sig = ground_truth_signals("pool_sf_city")
    assert sig["u_maya"]["frequentPlaces"] == ["vn_little_fern"] and sig["u_maya"]["sensitivePlace"]
    assert sum(bool(s["sensitivePlace"]) for s in sig.values()) >= 25
    export = load_ground_truth_export("pool_sf_city")
    reg = Registry()
    for n, s in schemas().items():
        reg = reg.with_resource(n, Resource.from_contents(s))
    assert list(Draft202012Validator(schemas()["pool_export.schema.json"], registry=reg).iter_errors(export)) == []
    flat = [s for u in export["users"] for s in u["signals"]]
    assert any(s["kind"] == "routine" for s in flat) and any(s["sensitive"] for s in flat)
    assert all(s["visibility"] == "hidden" for s in flat if s["sensitive"])
