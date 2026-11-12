"""cg-sim run: plan-based Monte Carlo over random / greedy / common_ground (PRD-3 §6).

Writes data/sim/runs/<runId>/{config.json, results.jsonl, replay.json}. results.jsonl has one row per
(variant, policy, cell, seed): the metric dict from engine.simulate (minus traces).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from datetime import UTC, datetime

from cg_sim.contracts import data_dir
from cg_sim.mc import engine, replay
from cg_sim.mc.world import build, cells

# Ablations for the params recommendations: Common Ground at the 1.0 x 1.0 cell, one override each.
ABLATIONS = {
    "maxPerActivityType=4": {"feed.maxPerActivityType": 4},
    "exposureCapPerDay=20": {"plans.exposureCapPerDay": 20},
    "exposureCapPerDay=80": {"plans.exposureCapPerDay": 80},
    # At the default cap (40/day) no plan hits the cap in this pool, so isolationBoost has nothing to reorder;
    # these three show the boost where exposure is contested.
    "exposureCapPerDay=10": {"plans.exposureCapPerDay": 10},
    "exposureCapPerDay=10,isolationBoost=0": {"plans.exposureCapPerDay": 10, "matching.isolationBoost": 0.0},
    "exposureCapPerDay=10,isolationBoost=1": {"plans.exposureCapPerDay": 10, "matching.isolationBoost": 1.0},
    "isolationBoost=0": {"matching.isolationBoost": 0.0},
    "isolationBoost=1": {"matching.isolationBoost": 1.0},
    "formLeadHours=12": {"plans.formLeadHours": 12},
    "formLeadHours=48": {"plans.formLeadHours": 48},
}

_W = None


def _init(world):
    global _W
    _W = world


def _task(args):
    policies, ci, cell, seed, world_model = args
    rows = []
    for pol in policies:
        m = engine.simulate(_W, pol, seed, cell[0], cell[1], world_model=world_model)
        rows.append({"policy": pol, "cell": ci, "flake": cell[0], "join": cell[1], "seed": seed, **m})
    return rows


def _run(world, tasks, workers):
    if workers <= 1:
        _init(world)
        return [r for t in tasks for r in _task(t)]
    with ProcessPoolExecutor(workers, initializer=_init, initargs=(world,)) as ex:
        return [r for rows in ex.map(_task, tasks, chunksize=8) for r in rows]


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(prog="cg-sim run")
    ap.add_argument("--pool", default="pool_sf_city")
    ap.add_argument("--fake-laya", action="store_true", help="hash-based Laya tables (no data/sim/laya_gt needed)")
    ap.add_argument("--seeds", type=int, help="default params.sim.seeds")
    ap.add_argument("--cells", choices=["all", "center"], default="all")
    ap.add_argument("--weeks", type=int)
    ap.add_argument("--users", type=int, help="toy pool: first N personas")
    ap.add_argument("--world", choices=["tables", "truth"], default="tables")
    ap.add_argument("--no-ablate", action="store_true")
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    ap.add_argument("--run-id")
    a = ap.parse_args(argv)

    t0 = time.time()
    if not a.fake_laya and not (data_dir() / "sim" / "laya_gt" / a.pool / "activity.parquet").exists():
        print(f"no data/sim/laya_gt/{a.pool}; run `cg-sim precompute` or pass --fake-laya", file=sys.stderr)
        return 2
    world = build(a.pool, a.fake_laya, a.weeks, a.users)
    seeds = a.seeds or world.params["sim"]["seeds"]
    grid = cells(world.params)
    center = grid.index((1.0, 1.0))
    use = list(enumerate(grid)) if a.cells == "all" else [(center, grid[center])]
    run_id = a.run_id or (datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
                          + f"_{a.pool}_{'fake' if a.fake_laya else 'laya'}_{a.world}")
    out = data_dir() / "sim" / "runs" / run_id
    out.mkdir(parents=True, exist_ok=True)
    print(f"run {run_id}: {len(world.users)} people, {len(world.plans)} plans, {seeds} seeds x {len(use)} cells "
          f"x {len(engine.POLICIES)} policies, {a.workers} workers", file=sys.stderr)

    tasks = [(engine.POLICIES, ci, cell, s, a.world) for ci, cell in use for s in range(seeds)]
    rows = [{"variant": "base", **r} for r in _run(world, tasks, a.workers)]
    t_main = time.time() - t0

    if not a.no_ablate:
        for name, ov in ABLATIONS.items():
            w2 = build(a.pool, a.fake_laya, a.weeks, a.users, overrides=ov)
            t = [(("common_ground",), center, grid[center], s, a.world) for s in range(seeds)]
            rows += [{"variant": name, **r} for r in _run(w2, t, a.workers)]

    with open(out / "results.jsonl", "w") as f:
        for r in rows:
            f.write(json.dumps(r, separators=(",", ":")) + "\n")
    traces = {pol: engine.simulate(world, pol, 0, 1.0, 1.0, trace=True, world_model=a.world)["frames"]
              for pol in engine.POLICIES}
    (out / "replay.json").write_text(json.dumps(replay.build(world, run_id, traces, rows, center), separators=(",", ":")))
    config = {"runId": run_id, "poolId": a.pool, "fakeLaya": a.fake_laya, "world": a.world, "seeds": seeds,
              "cells": [{"flake": c[0], "join": c[1]} for _, c in use], "centerCell": center,
              "policies": list(engine.POLICIES), "people": len(world.users), "plans": len(world.plans),
              "weeks": world.weeks, "joinDaily": engine.JOIN_DAILY, "ablations": ABLATIONS if not a.no_ablate else {},
              "mainSeconds": round(t_main, 1), "totalSeconds": round(time.time() - t0, 1),
              "matching": "cg_matching" if engine.ma.HAVE_MATCHING else "matching_adapter fallback"}
    (out / "config.json").write_text(json.dumps(config, indent=2) + "\n")
    print(f"done in {config['totalSeconds']}s (main grid {config['mainSeconds']}s) -> {out}", file=sys.stderr)
    return 0
