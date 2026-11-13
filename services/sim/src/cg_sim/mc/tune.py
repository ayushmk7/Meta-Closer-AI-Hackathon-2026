"""Tune the learning loop: common_ground_learned over prefAlpha x prefBoost x reward source, center cell.

    uv run python -m cg_sim.mc.tune [--seeds 20] [--weeks 8] [--fake-laya] [--from <runId>]

Select on seeds 0..N-1, then re-run each winner (and plain common_ground) on held-out seeds N..2N-1 and report
only those numbers: picking the max of 32+ noisy settings and reporting it on the same seeds is winner's curse.
Baseline = plain common_ground on the same seeds (no prefs, so alpha/boost/reward do not touch it).
Reward source (`sim.learnFrom`, sim-only, never in params.yaml): "all" = plan D incl. the no-show penalty;
"meet_again" = only the pair meet-again outcome of people who showed, which per-person keys cannot use to
re-learn the hashed p_show. Writes data/sim/runs/<runId>/{tune.jsonl, REPORT.md}. Exploratory.
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

ALPHAS, BOOSTS, SOURCES = [0.1, 0.3, 0.6, 0.9], [0.3, 0.6, 1.0, 1.5], ["all", "meet_again"]
# (key, label, higher is better)
METRICS = [("showRate", "show-up rate", True), ("friendShareW8", "friendship share", True),
           ("isolatedLowW8", "low-outgoing isolated", False), ("fillRate", "fill rate", True)]
BASE = {"matching.prefAlpha": None, "matching.prefBoost": None, "sim.learnFrom": None}
HARM = 0.02  # a metric's mean worse by more than 2 points disqualifies


def _k(c: dict) -> str:
    return json.dumps(c, sort_keys=True)


def _run(w, tasks, workers, weeks, split):
    with ProcessPoolExecutor(workers, initializer=grid._init, initargs=(w,)) as ex:
        return [{**r, "weeks": weeks, "split": split} for r in ex.map(grid._one, tasks, chunksize=2)]


def _diffs(by, weeks, split, combo):
    lr = by[(weeks, split, _k(combo), "common_ground_learned")]
    cg = by[(weeks, split, _k(BASE), "common_ground")]
    ds = [ci95([lr[s][k] - cg[s][k] for s in lr]) for k, _, _ in METRICS]
    good = [d[1] > 0 if hb else d[2] < 0 for d, (_, _, hb) in zip(ds, METRICS)]
    harm = any((-d[0] if hb else d[0]) > HARM for d, (_, _, hb) in zip(ds, METRICS))
    return ds, good, harm


def _gain(ds):
    return sum(d[0] if hb else -d[0] for d, (_, _, hb) in zip(ds, METRICS))


def _by(rows):
    by = {}
    for r in rows:
        by.setdefault((r["weeks"], r["split"], _k(r["combo"]), r["policy"]), {})[r["seed"]] = r
    return by


def _select(by, weeks, combos):
    """Best combo per reward source on the selection seeds: most metrics clearly better, then summed gain."""
    best = {}
    for src in SOURCES:
        cands = []
        for c in (c for c in combos if c["sim.learnFrom"] == src):
            ds, good, harm = _diffs(by, weeks, "select", c)
            if any(good) and not harm:
                cands.append((sum(good), _gain(ds), c))
        best[src] = max(cands, key=lambda x: x[:2])[2] if cands else None
    return best


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="cg_sim.mc.tune")
    ap.add_argument("--pool", default="pool_sf_city")
    ap.add_argument("--seeds", type=int, default=20, help="selection seeds; the same number again is held out")
    ap.add_argument("--weeks", default="8")
    ap.add_argument("--fake-laya", action="store_true")
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    ap.add_argument("--from", dest="src", help="re-render REPORT.md from an existing tune run id (no simulation)")
    a = ap.parse_args(argv)
    combos = [{"matching.prefAlpha": al, "matching.prefBoost": bo, "sim.learnFrom": src}
              for src, al, bo in itertools.product(SOURCES, ALPHAS, BOOSTS)]
    n = a.seeds
    if a.src:
        run_id, out = a.src, data_dir() / "sim" / "runs" / a.src
        rows = [json.loads(x) for x in (out / "tune.jsonl").read_text().splitlines() if x]
        weeks_list = sorted({r["weeks"] for r in rows})
        n = len({r["seed"] for r in rows if r["split"] == "select"})
    else:
        weeks_list, rows = [int(x) for x in a.weeks.split(",")], []
        for weeks in weeks_list:
            w = build(a.pool, a.fake_laya, weeks)
            sel = [(c, "common_ground_learned", s) for c in combos for s in range(n)]
            sel += [(BASE, "common_ground", s) for s in range(n)]
            rows += _run(w, sel, a.workers, weeks, "select")
            winners = [c for c in _select(_by(rows), weeks, combos).values() if c]
            held = [(c, "common_ground_learned", s) for c in winners for s in range(n, 2 * n)]
            held += [(BASE, "common_ground", s) for s in range(n, 2 * n)]
            rows += _run(w, held, a.workers, weeks, "heldout")
        run_id = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ") + f"_{a.pool}_tune"
        out = data_dir() / "sim" / "runs" / run_id
        out.mkdir(parents=True, exist_ok=True)
        (out / "tune.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows))

    by = _by(rows)
    pct = lambda d: f"{d[0]:+.1%} [{d[1]:+.1%}, {d[2]:+.1%}]"  # noqa: E731
    head = "| " + " | ".join(lab for _, lab, _ in METRICS) + " |"
    L = [f"# Learning-loop tune: {run_id}", "", "## Learning-loop tune (common_ground_learned vs common_ground)", "",
         f"Center cell, horizons {weeks_list} weeks, Laya {'fake (render_state hash)' if a.fake_laya else 'laya_gt'}. "
         f"Settings are **selected on seeds 0-{n - 1}** (some metric better with the seed-paired 95% interval "
         f"excluding 0, no metric's mean worse by > {HARM:.0%}; most clearly better metrics, then summed gain) and "
         f"**reported on held-out seeds {n}-{2 * n - 1}**. A metric is confirmed only if it clears 0 on both the selection and the held-out seeds. "
         "Exploratory; params.yaml unchanged.", ""]
    for weeks in weeks_list:
        best = _select(by, weeks, combos)
        L += [f"### {weeks} weeks: held-out result per reward source", "",
              "| reward source | alpha | boost " + head + " confirmed held out |",
              "|---|---|---|" + "---|" * len(METRICS) + "---|"]
        for src, c in best.items():
            if not c:
                L.append(f"| {src} | - | - |" + " |" * len(METRICS) + " none passed selection |")
                continue
            ds, good, harm = _diffs(by, weeks, "heldout", c)
            sel_good = _diffs(by, weeks, "select", c)[1]  # confirmed = clearly better on selection AND held out
            ok = [lab for g, sg, (_, lab, _) in zip(good, sel_good, METRICS) if g and sg]
            L.append(f"| {src} | {c['matching.prefAlpha']:g} | {c['matching.prefBoost']:g} | "
                     + " | ".join(pct(d) for d in ds)
                     + f" | {', '.join(ok) if ok and not harm else 'none'} |")
        L += ["", f"Selection seeds (0-{n - 1}), every setting:", "",
              "| reward source | alpha | boost " + head + " clearly better |",
              "|---|---|---|" + "---|" * len(METRICS) + "---|"]
        for c in combos:
            ds, good, _ = _diffs(by, weeks, "select", c)
            L.append(f"| {c['sim.learnFrom']} | {c['matching.prefAlpha']:g} | {c['matching.prefBoost']:g} | "
                     + " | ".join(pct(d) for d in ds) + f" | {sum(good)} |")
        L.append("")
    L.append("Show-up gains under reward source `all` are partly self-reading: prefs learn each person's realized "
             "show-ups from the same hashed p_show the world draws from. Not evidence while Laya tables are fake."
             if a.fake_laya else "")
    (out / "REPORT.md").write_text("\n".join(L) + "\n")
    print(out / "REPORT.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
