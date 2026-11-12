import json

import pyarrow.parquet as pq
import pytest

from cg_sim import laya, precompute
from cg_sim.contracts import params, taxonomy
from cg_sim.evalx import evaluate

POOL = "pool_evt_closer_together"  # smaller pool keeps the test fast


@pytest.fixture(scope="module")
def tables(tmp_path_factory):
    out = tmp_path_factory.mktemp("t")
    precompute.run(POOL, fake=True, use_ground_truth=True, out=out, reload=False)
    return out


def test_manifest_and_shapes(tables):
    m = json.loads((tables / "manifest.json").read_text())
    act = pq.read_table(tables / "activity.parquet").to_pylist()
    meet = pq.read_table(tables / "meet_again.parquet").to_pylist()
    export = precompute.load_export(POOL, True)
    assert m["questionsVersion"] == 2 and m["poolId"] == POOL and m["layaModel"] == "fake"
    assert m["rows"] == {"activity": len(act), "meet_again": len(meet)}
    assert len(act) == len(export["users"]) * len(laya.questions()["activityTypes"])
    assert len({(r["user_id"], r["activity_type"]) for r in act}) == len(act)
    assert all(r["user_a"] < r["user_b"] for r in meet)
    assert all(0 <= r["p_join"] <= 1 and 0 <= r["p_show"] <= 1 for r in act)


def test_rows_match_fake_rule(tables):
    export = precompute.load_export(POOL, True)
    user = next(u for u in export["users"])
    row = next(r for r in pq.read_table(tables / "activity.parquet").to_pylist()
               if r["user_id"] == user["userId"] and r["activity_type"] == "hike")
    state = laya.render_state("show_up", users={"A": user},
                              activities={"A": precompute.load_activity(POOL)[user["userId"]]}, activityType="hike")
    assert row["p_show"] == laya.fake_p("show_up", state)
    assert row["p_join"] == laya.fake_p("join_activity", state)


def test_deterministic(tables, tmp_path):
    precompute.run(POOL, fake=True, use_ground_truth=True, out=tmp_path, reload=False)
    for f in ("activity.parquet", "meet_again.parquet", "manifest.json"):
        assert (tmp_path / f).read_bytes() == (tables / f).read_bytes()


def test_candidates_topk_and_states_hide_sensitive():
    export = precompute.load_export(POOL, True)
    k = params()["sim"]["candidatesPerUser"]
    cands = precompute.candidates(export, k)
    assert all(len(v) <= k and uid not in dict(v) for uid, v in cands.items())
    _, _, labels = taxonomy()
    for u in export["users"]:
        s = laya.user_summary(u, "A", [])
        for i in u["interests"]:
            if i["sensitive"] or i["visibility"] == "hidden":
                assert f"{labels[i['id']]} (" not in s


def test_evaluate_counts():
    truth = [{"userId": "u1", "interests": [{"id": "a.b.c", "sensitive": False}, {"id": "x.y.z", "sensitive": True}],
              "sensitivePlace": "vn_s", "frequentPlaces": ["vn_f"], "routines": [{"activity": "run"}]}]
    export = {"users": [{"userId": "u1", "interests": [
        {"id": "a.b.c", "weight": 1, "visibility": "shown", "sensitive": False},
        {"id": "a.b.d", "weight": 1, "visibility": "shown", "sensitive": False}],
        "signals": [{"kind": "frequent_place", "venueId": "vn_f", "sensitive": False, "interestIds": []},
                    {"kind": "routine", "venueId": None, "sensitive": False,
                     "interestIds": ["sports_fitness.running"]}]}]}
    r = evaluate(export, truth)
    assert r["interests_leaf"] == {"tp": 1, "predicted": 2, "actual": 2, "precision": 0.5, "recall": 0.5}
    assert r["interests_level2"]["recall"] == 0.5
    assert r["sensitive_interests"]["recall"] == 0.0 and r["sensitive_places"]["recall"] == 0.0
    assert r["frequent_places"]["recall"] == 1.0 and r["routines"]["recall"] == 1.0


def test_ground_truth_eval_sees_signals(tmp_path):
    from cg_sim.evalx import main

    out = tmp_path / "x.json"
    assert main(["--pool", POOL, "--use-ground-truth", "--out", str(out)]) == 0
    r = json.loads(out.read_text())["pools"][POOL]
    assert r["sensitive_places"]["actual"] > 0 and r["sensitive_places"]["recall"] == 1.0
    assert r["frequent_places"]["recall"] == 1.0 and r["routines"]["recall"] == 1.0
