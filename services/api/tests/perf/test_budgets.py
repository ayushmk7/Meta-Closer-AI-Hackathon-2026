"""PRD-2 §5 budgets for slice A on the real seed scaled to 400 people and 600 plans:
seed load < 60 s, reset < 10 s (D2), A's GETs p95 < 300 ms. Skips without data/seed."""

import asyncio
import copy
import time
from pathlib import Path

import pytest

from cg_api import seed, settings
from cg_api.store import store

DATA = Path(__file__).resolve().parents[4] / "data"


def _p95(fn, n=20) -> float:
    ts = []
    for _ in range(n):
        t = time.perf_counter()
        fn()
        ts.append(time.perf_counter() - t)
    return sorted(ts)[int(n * 0.95) - 1]


def test_budgets_at_scale(public, internal, monkeypatch):
    if not (DATA / "seed" / "pool_sf_city" / "pool.json").exists():
        pytest.skip("no data/seed")
    monkeypatch.setattr(seed, "get_settings", lambda: settings.Settings(data_dir=DATA))
    try:
        t = time.perf_counter()
        asyncio.run(seed.load("pool_sf_city"))
        load_s = time.perf_counter() - t
        city = [u for u, x in store.users.items() if x["poolId"] == "pool_sf_city" and x["synthetic"]]
        for k in range(400 - len(city) - 1):  # + Maya = 400 in the city pool
            src = store.users[city[k % len(city)]]
            store.users[f"u_x{k:04d}"] = {**copy.deepcopy(src), "persona": {**src["persona"], "userId": f"u_x{k:04d}"}}
        plans = [p for p in store.plans.values() if p["poolId"] == "pool_sf_city"]
        for k in range(600 - len(plans)):
            pid = f"pl_x{k:04d}"
            store.plans[pid] = {**plans[k % len(plans)], "planId": pid, "seedJoinIds": []}
        store.snapshot()

        t = time.perf_counter()
        internal.post("/internal/v1/demo/reset")
        reset_s = time.perf_counter() - t
        public.post("/v1/optin", json={"mode": "city"})
        p95 = {
            "getMe": _p95(lambda: public.get("/v1/me")),
            "getSetup": _p95(lambda: public.get("/v1/me/setup")),
            "listConnectors": _p95(lambda: public.get("/v1/connectors")),
            "listSignals": _p95(lambda: public.get("/v1/signals")),
            "getConfig": _p95(lambda: public.get("/v1/config")),
            "metrics": _p95(lambda: internal.get("/internal/v1/metrics", params={"poolId": "pool_sf_city"})),
            "export": _p95(lambda: internal.get("/internal/v1/pools/pool_sf_city/export"), 5),
            "graph": _p95(lambda: internal.get("/internal/v1/pools/pool_sf_city/graph"), 5),
        }
        print(f"load {load_s:.2f}s reset {reset_s:.2f}s", {k: f"{v * 1000:.0f}ms" for k, v in p95.items()})
        assert load_s < 60 and reset_s < 10
        assert all(v < 0.3 for v in p95.values()), p95
    finally:
        monkeypatch.undo()
        asyncio.run(seed.load("pool_sf_city"))
