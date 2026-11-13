"""Params grid for Common Ground at the center cell (exploratory; never edits contracts/params.yaml).

    uv run python -m cg_sim.mc.grid [--seeds 10] [--fake-laya]

Writes data/sim/runs/<runId>/{grid.jsonl, GRID.md}. Greedy is the baseline on the same seeds (these params
do not touch greedy). A combo "passes" if CG beats greedy on low-outgoing isolated at week 8 (seed-paired 95%
upper bound < 0) and CG's fill rate drops at most 5 points versus CG at current params.
"""

from __future__ import annotations

import argparse
import copy
import dataclasses
import itertools
import json
import os
from concurrent.futures import ProcessPoolExecutor
from datetime import UTC, datetime

from cg_sim.contracts import data_dir
from cg_sim.mc import engine
from cg_sim.mc.world import build, ci95

INF = 99  # ponytail: "no cap" = larger than any feed (feed.size 8)
# ponytail: caps / fill floor / isolationBoost were swept in the b2 grid (none passed); b3 sweeps the reunion levers.
GRID = {
    "matching.reunionBoost": [0, 0.5, 1, 2, 4],
    "matching.crowdBoost": [0, 0.5, 1, 2],
}
_W = None


def _init(w):
    global _W
    _W = w


def _one(args):
    combo, policy, seed = args
    p = copy.deepcopy(_W.params)
    for dotted, v in combo.items():
        if v is not None:
            sec, key = dotted.split(".")
            p[sec][key] = v
    m = engine.simulate(dataclasses.replace(_W, params=p), policy, seed)
    return {"combo": combo, "policy": policy, "seed": seed,
            **{k: v for k, v in m.items() if not isinstance(v, list)}}


def _key(c: dict) -> str:
    return json.dumps(c, sort_keys=True)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="cg_sim.mc.grid")
    ap.add_argument("--pool", default="pool_sf_city")
    ap.add_argument("--seeds", type=int, default=10)
    ap.add_argument("--fake-laya", action="store_true")
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    a = ap.parse_args(argv)
    w = build(a.pool, a.fake_laya)
    cur = {k: w.params[k.split(".")[0]].get(k.split(".")[1]) for k in GRID}
    combos = [dict(zip(GRID, vals)) for vals in itertools.product(*GRID.values())]
    base = {k: None for k in GRID}  # current params
    tasks = [(c, "common_ground", s) for c in combos + [base] for s in range(a.seeds)]
    tasks += [(base, "greedy", s) for s in range(a.seeds)]
    with ProcessPoolExecutor(a.workers, initializer=_init, initargs=(w,)) as ex:
        rows = list(ex.map(_one, tasks, chunksize=2))

    run_id = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ") + f"_{a.pool}_grid"
    out = data_dir() / "sim" / "runs" / run_id
    out.mkdir(parents=True, exist_ok=True)
    (out / "grid.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows))
    by = {}
    for r in rows:
        by.setdefault((_key(r["combo"]), r["policy"]), {})[r["seed"]] = r
    greedy, cg0 = by[(_key(base), "greedy")], by[(_key(base), "common_ground")]

    def diff(rs, ref, k):
        return ci95([rs[s][k] - ref[s][k] for s in rs])

    res = []
    for c in combos:
        rs = by[(_key(c), "common_ground")]
        iso = ci95([rs[s]["isolatedLowW8"] for s in rs])
        d_g = diff(rs, greedy, "isolatedLowW8")
        f_cg, f_g = diff(rs, cg0, "fillRate"), diff(rs, greedy, "fillRate")
        res.append((d_g[0], c, iso, d_g, f_cg, f_g, d_g[2] < 0 and f_cg[0] >= -0.05))
    res.sort(key=lambda x: x[0])

    g_iso = ci95([greedy[s]["isolatedLowW8"] for s in greedy])
    c_iso = ci95([cg0[s]["isolatedLowW8"] for s in cg0])
    pct = lambda t: f"{t[0]:+.1%} [{t[1]:+.1%}, {t[2]:+.1%}]"  # noqa: E731
    lab = lambda v: "current" if v is None else ("inf" if v == INF else f"{v:g}")  # noqa: E731
    L = [f"# CG params grid: {run_id}", "",
         f"Center cell, {a.seeds} seeds, real cg_matching={engine.ma.HAVE_MATCHING}, "
         f"Laya {'fake (render_state hash)' if a.fake_laya else 'data/sim/laya_gt'}. Current params: {cur}. Exploratory; params.yaml unchanged.",
         "", f"Baselines: greedy isolated {g_iso[0]:.1%} [{g_iso[1]:.1%}, {g_iso[2]:.1%}]; "
         f"CG at current params {c_iso[0]:.1%} [{c_iso[1]:.1%}, {c_iso[2]:.1%}].", "",
         "| " + " | ".join(k.split(".")[1] for k in GRID) + " | CG isolated w8 | CG - greedy isolated | fill vs CG current "
         "| fill vs greedy | passes |", "|---" * (len(GRID) + 5) + "|"]
    for _, c, iso, d_g, f_cg, f_g, ok in res:
        L.append("| " + " | ".join(lab(c[k]) for k in GRID) + " | "
                 f"{iso[0]:.1%} [{iso[1]:.1%}, {iso[2]:.1%}] | {pct(d_g)} | {pct(f_cg)} | {pct(f_g)} | "
                 f"{'yes' if ok else 'no'} |")
    (out / "GRID.md").write_text("\n".join(L) + "\n")
    print(out / "GRID.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
