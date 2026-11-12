"""PRD-2 §5 budgets for slice A with the real seed scaled to 400 city people and 600 city plans, written as a
seed dir and loaded for real: seed load < 60 s, reset < 10 s (D2), A's GETs p95 < 300 ms. Skips without data/seed."""

import asyncio
import json
import shutil
import time
from pathlib import Path

import pytest

from cg_api import seed, settings

DATA = Path(__file__).resolve().parents[4] / "data"
N = 20  # samples per endpoint; p95 = 19th of 20


def _rows(path: Path) -> list[dict]:
    return [json.loads(x) for x in path.read_text().splitlines() if x.strip()]


def _write(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(json.dumps(r) + "\n" for r in rows))


def _scaled_city(dst: Path, people: int, plans: int) -> None:
    """Clone personas (with their activity and connector records) and plans until the targets are met."""
    src = DATA / "seed" / "pool_sf_city"
    shutil.copytree(src, dst)
    personas, acts, recs, pls = (
        _rows(src / f) for f in ("personas.jsonl", "activity.jsonl", "connectors.jsonl", "plans.jsonl")
    )
    synth = [p for p in personas if p["userId"] != "u_maya"]
    for k in range(people - len(personas)):
        base = synth[k % len(synth)]
        uid = f"u_x{k:04d}"
        personas.append({**base, "userId": uid, "avatar": None})
        acts += [
            {**a, "activityId": f"{a['activityId']}_x{k}", "userId": uid} for a in acts if a["userId"] == base["userId"]
        ]
        recs += [
            {**r, "recordId": f"{r['recordId']}_x{k}", "userId": uid} for r in recs if r["userId"] == base["userId"]
        ]
    for k in range(plans - len(pls)):
        pls.append({**pls[k % len(pls)], "planId": f"pl_x{k:04d}", "seedJoinIds": []})
    for name, rows in (("personas", personas), ("activity", acts), ("connectors", recs), ("plans", pls)):
        _write(dst / f"{name}.jsonl", rows)


def _p95(fn) -> float:
    ts = []
    for _ in range(N):
        t = time.perf_counter()
        r = fn()
        ts.append(time.perf_counter() - t)
        assert 200 <= r.status_code < 300, r.text
    return sorted(ts)[int(N * 0.95) - 1]


def test_budgets_at_scale(public, internal, monkeypatch, tmp_path):
    if not (DATA / "seed" / "pool_sf_city" / "pool.json").exists():
        pytest.skip("no data/seed")
    _scaled_city(tmp_path / "seed" / "pool_sf_city", people=400, plans=600)
    monkeypatch.setattr(seed, "get_settings", lambda: settings.Settings(data_dir=tmp_path))
    from cg_api.store import store

    try:
        t = time.perf_counter()
        asyncio.run(seed.load("pool_sf_city"))
        load_s = time.perf_counter() - t
        city = [u for u in store.users.values() if u["poolId"] == "pool_sf_city" or u["persona"]["userId"] == "u_maya"]
        assert len(city) == 400 and sum(p["poolId"] == "pool_sf_city" for p in store.plans.values()) == 600

        t = time.perf_counter()
        assert internal.post("/internal/v1/demo/reset").status_code == 204
        reset_s = time.perf_counter() - t
        assert public.post("/v1/optin", json={"mode": "city"}).status_code == 200
        p95 = {
            "getMe": _p95(lambda: public.get("/v1/me")),
            "getSetup": _p95(lambda: public.get("/v1/me/setup")),
            "listConnectors": _p95(lambda: public.get("/v1/connectors")),
            "listSignals": _p95(lambda: public.get("/v1/signals")),
            "getConfig": _p95(lambda: public.get("/v1/config")),
            "metrics": _p95(lambda: internal.get("/internal/v1/metrics", params={"poolId": "pool_sf_city"})),
            "export": _p95(lambda: internal.get("/internal/v1/pools/pool_sf_city/export")),
            "graph": _p95(lambda: internal.get("/internal/v1/pools/pool_sf_city/graph")),
        }
        print(f"load {load_s:.2f}s reset {reset_s:.2f}s", {k: f"{v * 1000:.0f}ms" for k, v in p95.items()})
        assert load_s < 60 and reset_s < 10
        assert all(v < 0.3 for v in p95.values()), p95
    finally:
        monkeypatch.undo()
        asyncio.run(seed.load("pool_sf_city"))
