import json
import math

import numpy as np
import pytest

from cg_sim import mc, report
from cg_sim.contracts import data_dir
from cg_sim.mc import engine
from cg_sim.mc.world import build, ci95

POOL = "pool_sf_city"


@pytest.fixture(scope="module")
def toy():
    return build(POOL, fake_laya=True, limit_users=30)


def test_gini_hand_cases():
    assert engine.gini([1, 1, 1]) == 0
    assert engine.gini([0, 0, 3]) == pytest.approx(2 / 3)
    assert engine.gini([0, 0, 0]) == 0


def test_ci95_and_first_come():
    m, lo, hi = ci95([0.2, 0.4])
    assert m == pytest.approx(0.3) and lo < m < hi
    assert all(math.isnan(x) for x in ci95([]))
    assert engine._first_come(list(range(8)), 3, 6) == ([[0, 1, 2, 3, 4, 5]], [6, 7])
    assert engine._first_come(list(range(9)), 3, 6) == ([[0, 1, 2, 3, 4, 5], [6, 7, 8]], [])


def test_toy_fixed_seed_regression(toy):
    a = engine.simulate(toy, "common_ground", 3)
    b = engine.simulate(toy, "common_ground", 3)
    assert json.dumps(a) == json.dumps(b)  # same seed, same everything (NaN-safe)
    assert len(a["isolatedLowByWeek"]) == toy.weeks + 1 and a["isolatedLowByWeek"][0] == 1.0
    # Pinned on seed v2 (seed 7) + S2 fake tables + S1 adapter fixes (13483b0). Re-pin only when the seed, adapter or engine changes on purpose.
    assert (a["fillRate"], a["friendShareW8"], a["joinToMeetup"]) == pytest.approx((0.2291667, 0.1, 0.3053435))
    for k in ("fillRate", "friendShareW8", "isolatedLowW8", "lowSeatedShare"):
        assert 0.0 <= a[k] <= 1.0


def test_policies_share_world_and_streams(toy):
    snap = {k: getattr(toy, k).copy() for k in ("elig", "fit", "pj", "ps", "pm", "form_day")}
    runs = {p: engine.simulate(toy, p, 1) for p in engine.POLICIES}
    for k, v in snap.items():  # no policy mutates the shared population or inventory
        assert np.array_equal(getattr(toy, k), v)
    # random streams depend only on (seed, day, purpose), never on the policy
    assert np.array_equal(engine._rng(1, 5, "join").random(4), engine._rng(1, 5, "join").random(4))
    assert set(runs) == set(engine.POLICIES)


def test_run_report_replay_end_to_end(tmp_path, monkeypatch):
    real = data_dir()
    for sub in ("seed", "sim_private"):
        (tmp_path / sub).symlink_to(real / sub)
    monkeypatch.setenv("CG_DATA_DIR", str(tmp_path))
    argv = ["--pool", POOL, "--fake-laya", "--users", "30", "--seeds", "3", "--cells", "center",
            "--workers", "1", "--run-id", "toy", "--weeks", "3"]
    assert mc.main(argv) == 0
    assert report.main(["--run-id", "toy"]) == 0
    run = tmp_path / "sim" / "runs" / "toy"
    text = (run / "REPORT.md").read_text()
    assert "## Headline" in text and "not predictions" in text and (run / "isolated_share.png").exists()
    rp = json.loads((run / "replay.json").read_text())
    assert rp["policies"] == list(engine.POLICIES) and rp["weeks"] == 3
    for pol, frames in rp["frames"].items():
        assert [f["week"] for f in frames] == [1, 2, 3]
        for f in frames:
            assert all(a < b for a, b in f["metPairs"] + f["friendships"])
        assert len(rp["isolatedShare"][pol]["mean"]) == 4
    assert {"userId", "lat", "lng", "sceneId", "lowOutgoing"} <= set(rp["people"][0])
