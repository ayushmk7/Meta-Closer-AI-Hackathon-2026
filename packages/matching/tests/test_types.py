import json
import random

import pyarrow as pa
import pyarrow.parquet as pq
import pytest
from conftest import NOW, export, plan, user, venue

import cg_matching as cgm


def test_records_round_trip():
    rec = plan(seedJoinIds=["u_0001"])
    assert cgm.Plan.from_record(rec).to_record() == rec
    v = venue()
    assert cgm.Venue.from_record(v).to_record() == v
    pool = cgm.PoolSnapshot.from_export(
        export(
            [user("u_a", {"x.y": 1})], plans=[{"planId": "pl_1", "status": "open", "interestedIds": ["u_a"]}]
        )
    )
    assert pool.joined("pl_1") == ["u_a"] and pool.joined("pl_2") == []
    assert cgm.MatchState(**{"exposures": {"pl_1": 2}}).to_dict()["exposures"] == {"pl_1": 2}


def test_params_from_contracts(params):
    assert params["groups"]["strangerSizeMin"] == 3


def test_laya_tables_from_dir(tmp_path):
    pq.write_table(
        pa.table({"user_id": ["u_a"], "activity_type": ["coffee"], "p_join": [0.9], "p_show": [0.8]}),
        tmp_path / "activity.parquet",
    )
    pq.write_table(
        pa.table({"user_a": ["u_a"], "user_b": ["u_b"], "p_meet_again": [0.7]}),
        tmp_path / "meet_again.parquet",
    )
    (tmp_path / "manifest.json").write_text(json.dumps({"poolId": "pool_test"}))
    t = cgm.LayaTables.from_dir(tmp_path)
    assert (t.p_join("u_a", "coffee"), t.p_show("u_a", "coffee")) == (0.9, 0.8)
    assert t.p_meet_again("u_b", "u_a") == 0.7  # order-insensitive
    assert t.p_join("u_z", "coffee") == t.default
    assert t.manifest["poolId"] == "pool_test"


def test_every_function_runs(ctx, params):
    pool = ctx["pool"]
    vec = cgm.build_vectors(pool, params)
    cands = cgm.candidates(pool, vec, params)
    scene_of = cgm.scenes(pool, cands, params, seed=7)
    proposed = cgm.propose_plans(pool, list(ctx["venues"].values()), scene_of, params, random.Random(1), NOW)
    assert all(isinstance(p, cgm.Plan) for p in proposed)
    ranked = cgm.rank_plans(
        pool, ctx["plans"], vec, ctx["venues"], ctx["tables"], ctx["state"], params, ctx["rng"]
    )
    assert all(isinstance(s, cgm.PlanScore) for ss in ranked.values() for s in ss)
    res = cgm.form_groups(
        ctx["plans"][0], sorted(pool.users)[:6], pool, cands, ctx["tables"], ctx["state"], params, ctx["rng"]
    )
    assert isinstance(res, cgm.FormResult) and res.to_dict()["groups"]
    assert cgm.travel_minutes((37.77, -122.42), (37.77, -122.42), "walk", params) == 0


def test_laya_tables_reject_nan():
    with pytest.raises(ValueError):
        cgm.LayaTables(meet_again={("u_a", "u_b"): float("nan")})
