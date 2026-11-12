"""cg-sim report: data/sim/runs/<runId>/REPORT.md (+ isolated_share.png) from a `cg-sim run` (PRD-3 §7).

Relative claims only. A claim is stated only if the seed-paired 95% interval of (common_ground - greedy) favours
Common Ground in every sweep cell that was run.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict

from cg_sim.contracts import data_dir
from cg_sim.mc.replay import band
from cg_sim.mc.world import ci95

# (key, label, higher is better)
METRICS = [
    ("isolatedLowW8", "Low-outgoing still isolated, week 8", False),
    ("friendShareW4", "People with >= 1 friendship, week 4", True),
    ("friendShareW8", "People with >= 1 friendship, week 8", True),
    ("fillRate", "Plan fill rate", True),
    ("joinToMeetup", "Join-to-meetup rate", True),
    ("showRate", "Show-up rate", True),
    ("giniFriends", "Gini of friend counts", False),
    ("medianDaysFirstMeetup", "Median days to first meetup", False),
    ("lowSeatedShare", "Low-outgoing seated at least once", True),
]


def _fmt(m, lo, hi, pct=True) -> str:
    if math.isnan(m):
        return "n/a"
    return f"{m:.1%} [{max(lo, 0):.1%}, {min(hi, 1):.1%}]" if pct else f"{m:.2f} [{lo:.2f}, {hi:.2f}]"


def paired(rows, key, a_sel, b_sel):
    """ci95 over seeds of a - b, rows matched by seed."""
    a = {r["seed"]: r[key] for r in rows if a_sel(r)}
    b = {r["seed"]: r[key] for r in rows if b_sel(r)}
    return ci95([a[s] - b[s] for s in sorted(a) if s in b])


def _verdict(lo, hi, higher_better) -> int:
    """+1 CG better (interval excludes 0 the right way), -1 worse, 0 unclear."""
    if math.isnan(lo):
        return 0
    if higher_better:
        return 1 if lo > 0 else -1 if hi < 0 else 0
    return 1 if hi < 0 else -1 if lo > 0 else 0


def _chart(rows, center, weeks, policies, path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    colors = {"random": "#9aa0a6", "greedy": "#d93025", "common_ground": "#1a73e8"}
    fig, ax = plt.subplots(figsize=(7, 4), dpi=120)
    for p in policies:
        b = band(rows, p, center, weeks)
        ax.plot(b["week"], b["mean"], label=p, color=colors.get(p), lw=2)
        ax.fill_between(b["week"], b["lo"], b["hi"], color=colors.get(p), alpha=0.2)
    ax.set_xlabel("week")
    ax.set_ylabel("low-outgoing people with no friendship")
    ax.set_ylim(0, 1.02)
    ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0))
    ax.legend()
    ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def render(run_dir) -> str:
    cfg = json.loads((run_dir / "config.json").read_text())
    rows = [json.loads(x) for x in (run_dir / "results.jsonl").read_text().splitlines() if x]
    base = [r for r in rows if r["variant"] == "base"]
    center, pols, weeks = cfg["centerCell"], cfg["policies"], cfg["weeks"]
    cells_run = sorted({r["cell"] for r in base})
    _chart(rows, center, weeks, pols, run_dir / "isolated_share.png")
    at = lambda pol, cell: lambda r: r["policy"] == pol and r["cell"] == cell  # noqa: E731

    L = [f"# Monte Carlo report: {cfg['runId']}", ""]
    L += [f"Pool `{cfg['poolId']}`, {cfg['people']} people, {cfg['plans']} plans over {weeks} weeks. "
          f"{cfg['seeds']} seeds x {len(cells_run)} sweep cells x {len(pols)} policies; world model `{cfg['world']}`; "
          f"Laya tables {'FAKE (hash)' if cfg['fakeLaya'] else 'precomputed'}; matching: {cfg['matching']}. "
          f"Main grid {cfg['mainSeconds']} s, total {cfg['totalSeconds']} s.", ""]
    L += ["All results are relative comparisons between policies on a synthetic pool. They are not predictions "
          "about real users.", ""]

    L += ["## Extraction and sensitive-gate eval", ""]
    ext = run_dir / "extraction.json"
    L += [f"```json\n{ext.read_text().strip()}\n```" if ext.exists()
          else "Not in this run (`cg-sim eval` writes `extraction.json` here; slice S2).", ""]

    # Headline
    key, label, hb = METRICS[0]
    g = ci95([r[key] for r in base if at("greedy", center)(r)])
    c = ci95([r[key] for r in base if at("common_ground", center)(r)])
    verdicts = [_verdict(*paired(base, key, at("common_ground", ci), at("greedy", ci))[1:], hb) for ci in cells_run]
    wins, losses = verdicts.count(1), verdicts.count(-1)
    L += ["## Headline", ""]
    if wins == len(cells_run):
        L += [f"**Common Ground leaves {c[0]:.0%} of low-outgoing people isolated at week 8 versus {g[0]:.0%} for "
              f"greedy, in all {len(cells_run)} sweep cells** (center cell, 95% intervals over seeds: "
              f"{_fmt(*c)} vs {_fmt(*g)})."]
    else:
        L += [f"No claim: Common Ground is better than greedy on \"{label.lower()}\" in {wins} of "
              f"{len(cells_run)} cells and worse in {losses}. Center cell: Common Ground {_fmt(*c)}, "
              f"greedy {_fmt(*g)}."]
    L += ["", "![isolated share](isolated_share.png)", "",
          "Shaded bands: 95% interval over seeds at flake x join = 1.0 x 1.0.", ""]

    L += ["## Every metric (center cell, mean [95% interval] over seeds)", "",
          "| Metric | " + " | ".join(pols) + " |", "| --- |" + " --- |" * len(pols)]
    for key, label, _ in METRICS:
        pct = key != "medianDaysFirstMeetup" and key != "giniFriends"
        L.append(f"| {label} | " + " | ".join(_fmt(*ci95([r[key] for r in base if at(p, center)(r)]), pct)
                                            for p in pols) + " |")
    L += ["", "## Robustness: Common Ground vs greedy across sweep cells", "",
          "Seed-paired 95% interval of the difference per cell. A claim needs better in every cell.", "",
          "| Metric | CG better | unclear | CG worse | claim |", "| --- | --- | --- | --- | --- |"]
    for key, label, hb in METRICS:
        v = [_verdict(*paired(base, key, at("common_ground", ci), at("greedy", ci))[1:], hb) for ci in cells_run]
        claim = "yes" if v.count(1) == len(v) else "no"
        L.append(f"| {label} | {v.count(1)} | {v.count(0)} | {v.count(-1)} | {claim} |")

    abl = defaultdict(list)
    for r in rows:
        if r["variant"] != "base":
            abl[r["variant"]].append(r)
    if abl:
        L += ["", "## Params ablations (Common Ground, center cell, seed-paired difference vs current params)", "",
              "| Change | isolated low-outgoing w8 | friendship share w8 | fill rate |", "| --- | --- | --- | --- |"]
        cg_base = lambda r: r["policy"] == "common_ground" and r["cell"] == center  # noqa: E731
        recs = []
        for name, rs in abl.items():
            both = rs + [r for r in base if cg_base(r)]
            cells_ = []
            for key in ("isolatedLowW8", "friendShareW8", "fillRate"):
                d = paired(both, key, lambda r, n=name: r["variant"] == n, lambda r: r["variant"] == "base" and cg_base(r))
                cells_.append(f"{d[0]:+.1%} [{d[1]:+.1%}, {d[2]:+.1%}]")
                if key == "isolatedLowW8" and _verdict(d[1], d[2], False) == 1:
                    recs.append((d[0], name, d))
            L.append(f"| `{name}` | " + " | ".join(cells_) + " |")
        L += ["", "`isolationBoost` only reorders contested exposures: at the default cap no plan hits "
              "`exposureCapPerDay`, so its rows sit at about zero; the cap-10 rows show it where it binds.",
              "", "## Recommended params.yaml changes", ""]
        withheld = [why for bad, why in ((cfg["matching"] != "cg_matching", "Common Ground ran on the matching_adapter fallback"),
                                         (wins != len(cells_run), "the headline has no claim"),
                                         (cfg["fakeLaya"], "Laya tables are fake")) if bad]
        if withheld:
            L.append(f"- Withheld: {'; '.join(withheld)}. The ablation table above is exploratory, not evidence.")
        elif recs:
            for _, name, d in sorted(recs):
                L.append(f"- `{name}`: isolated low-outgoing share at week 8 changes by {d[0]:+.1%} "
                         f"(95% [{d[1]:+.1%}, {d[2]:+.1%}]), run `{cfg['runId']}`. Propose via a `cg/contracts/` PR.")
        else:
            L.append("- None: no ablation lowered the week-8 isolated share with a 95% interval excluding zero.")
    L += ["", "## Method notes", "",
          f"- Daily ticks; carousels (random: random eligible plans; greedy: most-joined then fit; common_ground: "
          f"`rank_plans`), joins at p_join x join multiplier x {cfg['joinDaily']} per impression x linear fatigue to 0 "
          f"at `plans.openJoinsMax`, formation at formsAt (random/greedy first come in chunks of size.max; "
          f"common_ground `form_groups`), show-up at 1 - (1 - p_show) x flake multiplier, meet-again per pair.",
          "- Every policy sees the same people, the same weekly `propose_plans` inventory and the same random streams.",
          "- Fake Laya tables ignore interests, so in fake mode p_join is scaled by interest fit."
          if cfg["fakeLaya"] else "- Laya tables from data/sim/laya_gt.", ""]
    return "\n".join(L)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(prog="cg-sim report")
    ap.add_argument("--run-id", help="default: latest run under data/sim/runs")
    a = ap.parse_args(argv)
    root = data_dir() / "sim" / "runs"
    runs = sorted(p for p in root.glob("*") if (p / "results.jsonl").exists()) if root.exists() else []
    if a.run_id:
        runs = [root / a.run_id]
    if not runs or not (runs[-1] / "results.jsonl").exists():
        print("no run found; run `cg-sim run` first", file=sys.stderr)
        return 2
    out = runs[-1] / "REPORT.md"
    out.write_text(render(runs[-1]))
    print(out)
    return 0

