"""Tune the learning loop: common_ground_learned over prefAlpha x prefBoost (x horizon), center cell.

    uv run python -m cg_sim.mc.tune [--seeds 20] [--weeks 8,12] [--fake-laya]

Writes data/sim/runs/<runId>/{tune.jsonl, REPORT.md}. Baseline = plain common_ground on the same seeds and
horizon (it has no prefs, so alpha/boost do not touch it). A setting "wins" if some metric is better with a
seed-paired 95% interval excluding 0 and no metric's mean is worse by more than 2 points. Exploratory; never
edits contracts/params.yaml. End-of-horizon metrics (week 8 or 12).
"""

from __future__ import annotations

import argparse
import itertools
import json
import os
from concurrent.futures import ProcessPoolExecutor
from datetime import UTC, datetime

from cg_sim.contracts import data_dir
from cg_sim.mc import grid
from cg_sim.mc.world import build, ci95

ALPHAS, BOOSTS = [0.1, 0.3, 0.6, 0.9], [0.3, 0.6, 1.0, 1.5]
# (key, label, higher is better)
METRICS = [("showRate", "show-up rate", True), ("friendShareW8", "friendship share", True),
           ("isolatedLowW8", "low-outgoing isolated", False), ("fillRate", "fill rate", True)]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="cg_sim.mc.tune")
    ap.add_argument("--pool", default="pool_sf_city")
    ap.add_argument("--seeds", type=int, default=20)
    ap.add_argument("--weeks", default="8,12")
    ap.add_argument("--fake-laya", action="store_true")
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    ap.add_argument("--from", dest="src", help="re-render REPORT.md from an existing tune run id (no simulation)")
    a = ap.parse_args(argv)
    combos = [{"matching.prefAlpha": al, "matching.prefBoost": bo} for al, bo in itertools.product(ALPHAS, BOOSTS)]
    base = {"matching.prefAlpha": None, "matching.prefBoost": None}
    rows = []
    if a.src:
        out = data_dir() / "sim" / "runs" / a.src
        rows = [json.loads(x) for x in (out / "tune.jsonl").read_text().splitlines() if x]
        a.weeks = ",".join(map(str, sorted({r["weeks"] for r in rows})))
        a.seeds = len({r["seed"] for r in rows})
    for weeks in (map(int, a.weeks.split(",")) if not a.src else []):
        w = build(a.pool, a.fake_laya, weeks)
        tasks = [(c, "common_ground_learned", s) for c in combos for s in range(a.seeds)]
        tasks += [(base, "common_ground", s) for s in range(a.seeds)]
        with ProcessPoolExecutor(a.workers, initializer=grid._init, initargs=(w,)) as ex:
            rows += [{**r, "weeks": weeks} for r in ex.map(grid._one, tasks, chunksize=2)]

    if a.src:
        run_id = a.src
    else:
        run_id = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ") + f"_{a.pool}_tune"
        out = data_dir() / "sim" / "runs" / run_id
        out.mkdir(parents=True, exist_ok=True)
        (out / "tune.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows))
    by = {}
    for r in rows:
        by.setdefault((r["weeks"], json.dumps(r["combo"], sort_keys=True), r["policy"]), {})[r["seed"]] = r

    res = []
    for weeks in map(int, a.weeks.split(",")):
        cg = by[(weeks, json.dumps(base, sort_keys=True), "common_ground")]
        for c in combos:
            lr = by[(weeks, json.dumps(c, sort_keys=True), "common_ground_learned")]
            ds = [ci95([lr[s][k] - cg[s][k] for s in lr]) for k, _, _ in METRICS]
            good = [d[1] > 0 if hb else d[2] < 0 for d, (_, _, hb) in zip(ds, METRICS)]
            harm = [(-d[0] if hb else d[0]) > 0.02 for d, (_, _, hb) in zip(ds, METRICS)]
            res.append((weeks, c, ds, any(good) and not any(harm), sum(good)))
    # Per horizon: most metrics clearly better, then summed signed improvement (+ = better on every metric).
    gain = lambda r: sum(d[0] if hb else -d[0] for d, (_, _, hb) in zip(r[2], METRICS))  # noqa: E731
    best = {wk: max((r for r in res if r[0] == wk and r[3]), key=lambda r: (r[4], gain(r)), default=None)
            for wk in sorted({r[0] for r in res})}

    L = [f"# Learning-loop tune: {run_id}", "", "## Learning-loop tune (common_ground_learned vs common_ground)", "",
         f"Center cell, {a.seeds} seeds, horizons {a.weeks} weeks, Laya "
         f"{'fake (render_state hash)' if a.fake_laya else 'data/sim/laya_gt'}. Seed-paired 95% intervals of "
         "learned - plain CG at the end of the horizon. Wins = a metric better with the interval excluding 0 and no "
         "metric's mean worse by > 2 points. Exploratory; params.yaml unchanged.", "",
         "| weeks | alpha | boost | " + " | ".join(lab for _, lab, _ in METRICS) + " | wins | clearly better |",
         "|---|---|---|" + "---|" * len(METRICS) + "---|---|"]
    for weeks, c, ds, ok, n_good in res:
        L.append(f"| {weeks} | {c['matching.prefAlpha']:g} | {c['matching.prefBoost']:g} | "
                 + " | ".join(f"{d[0]:+.1%} [{d[1]:+.1%}, {d[2]:+.1%}]" for d in ds) + f" | {'yes' if ok else 'no'} | {n_good} |")
    L += [""] + [f"**Best at {wk} weeks:** " + (
        f"alpha {b[1]['matching.prefAlpha']:g}, boost {b[1]['matching.prefBoost']:g} ({b[4]} metrics clearly better)."
        if b else "none.") for wk, b in best.items()]
    L += ["", f"{sum(r[3] for r in res)} of {len(res)} settings pass the loose rule, mostly via show-up rate: prefs "
          f"learn each person's realized show-ups per activity. With 4 metrics x {len(res)} settings, a few intervals "
          "exclude 0 by chance, so prefer settings with several clearly better metrics that hold across horizons.",
          "Not evidence while Laya tables are fake: the policy ranks on the same hashed p_show the world draws from."
          if a.fake_laya else ""]
    (out / "REPORT.md").write_text("\n".join(L) + "\n")
    print(out / "REPORT.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
