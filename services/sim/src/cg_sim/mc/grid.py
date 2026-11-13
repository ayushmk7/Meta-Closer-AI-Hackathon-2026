"""Params grid for Common Ground (exploratory; never edits contracts/params.yaml).

    uv run python -m cg_sim.mc.grid [--seeds 10] [--holdout 50 [--confirm]] [--fake-laya] [--world truth]

1. Selection: every GRID combo at the center cell on seeds 0..seeds-1 -> grid.jsonl.
2. --holdout N: the --top best combos (by mean CG - greedy isolated) re-run at the center on fresh seeds
   seeds..seeds+N-1 (winner's curse) -> holdout.jsonl.
3. --confirm: the best held-out combo vs CG current vs greedy in all 25 sweep cells on the same held-out seeds
   -> confirm.jsonl. Adoption bar: isolation better than CG current in every cell (upper bound < 0), fill vs CG
   current >= -3 pts.
All diffs are seed-paired 95% CIs; tables go to GRID.md. "passes" (selection/holdout) = CG beats greedy on
low-outgoing isolated at week 8 (upper bound < 0) with fill vs CG current >= -5 pts. Greedy ignores these params.
With fake Laya tables every verdict is labelled exploratory, not evidence (same rule as report.render).
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
from cg_sim.mc.world import build, cells, ci95

INF = 99  # ponytail: "no cap" = larger than any feed (feed.size 8)
# ponytail: caps / fill floor / isolationBoost were swept in the b2 grid (none passed); b3 sweeps the reunion levers.
GRID = {
    "matching.fillToMax": [False, True],
    "matching.reunionBoost": [0, 1, 4],
    "matching.crowdBoost": [0, 0.5],
}
_W = None
_WORLD = "tables"


def _init(w, world_model="tables"):
    global _W, _WORLD
    _W, _WORLD = w, world_model


def _one(args):
    combo, policy, seed, flake, join = args
    p = copy.deepcopy(_W.params)
    for dotted, v in combo.items():
        if v is not None:
            sec, key = dotted.split(".")
            p[sec][key] = v
    m = engine.simulate(dataclasses.replace(_W, params=p), policy, seed, flake, join, world_model=_WORLD)
    return {"combo": combo, "policy": policy, "seed": seed, "flake": flake, "join": join,
            **{k: v for k, v in m.items() if not isinstance(v, list)}}


def _run(w, world_model, tasks, workers):
    if workers <= 1:
        _init(w, world_model)
        return [_one(t) for t in tasks]
    with ProcessPoolExecutor(workers, initializer=_init, initargs=(w, world_model)) as ex:
        return list(ex.map(_one, tasks, chunksize=2))


def _key(c: dict) -> str:
    return json.dumps(c, sort_keys=True)


def _index(rows):
    """{(combo key, policy, flake, join): {seed: row}}"""
    by = {}
    for r in rows:
        by.setdefault((_key(r["combo"]), r["policy"], r["flake"], r["join"]), {})[r["seed"]] = r
    return by


def _diff(rs, ref, k):
    return ci95([rs[s][k] - ref[s][k] for s in rs])


def _fake(pool: str, fake_flag: bool) -> bool:
    if fake_flag:
        return True
    m = data_dir() / "sim" / "laya_gt" / pool / "manifest.json"
    return not m.exists() or json.loads(m.read_text()).get("layaModel") == "fake"


pct = lambda t: f"{t[0]:+.1%} [{t[1]:+.1%}, {t[2]:+.1%}]"  # noqa: E731
lab = lambda v: "current" if v is None else str(v).lower() if isinstance(v, bool) else ("inf" if v == INF else f"{v:g}")  # noqa: E731


def _rank(by, combos, base, seeds, flake=1.0, join=1.0):
    """[(combo, CG isolated, CG - greedy isolated, fill vs CG current, fill vs greedy, passes)] best first."""
    greedy, cg0 = by[(_key(base), "greedy", flake, join)], by[(_key(base), "common_ground", flake, join)]
    res = []
    for c in combos:
        rs = by[(_key(c), "common_ground", flake, join)]
        d_g, f_cg = _diff(rs, greedy, "isolatedLowW8"), _diff(rs, cg0, "fillRate")
        res.append((c, ci95([rs[s]["isolatedLowW8"] for s in rs]), d_g, f_cg, _diff(rs, greedy, "fillRate"),
                    d_g[2] < 0 and f_cg[0] >= -0.05))
    return sorted(res, key=lambda x: x[2][0])


def _table(res):
    L = ["| " + " | ".join(k.split(".")[1] for k in GRID) + " | CG isolated w8 | CG - greedy isolated | fill vs CG current "
         "| fill vs greedy | passes |", "|---" * (len(GRID) + 5) + "|"]
    for c, iso, d_g, f_cg, f_g, ok in res:
        L.append("| " + " | ".join(lab(c[k]) for k in GRID) + f" | {iso[0]:.1%} [{iso[1]:.1%}, {iso[2]:.1%}] | "
                 f"{pct(d_g)} | {pct(f_cg)} | {pct(f_g)} | {'yes' if ok else 'no'} |")
    return L


def _confirm_table(by, combo, base, grid_cells):
    """Per-cell table + (adopt vs CG current in every cell, {worse|unclear|better: n} vs greedy)."""
    L = ["| flake | join | combo - greedy iso | combo - CG iso | combo - CG fill | combo - CG friends w8 "
         "| combo - CG show | CG - greedy iso | beats CG |", "|---" * 9 + "|"]
    adopt, vs_g = True, {"worse": 0, "unclear": 0, "better": 0}
    for fl, jn in grid_cells:
        g, cg, co = (by[(_key(c), pol, fl, jn)] for c, pol in
                     ((base, "greedy"), (base, "common_ground"), (combo, "common_ground")))
        iso, fill, d_g = _diff(co, cg, "isolatedLowW8"), _diff(co, cg, "fillRate"), _diff(co, g, "isolatedLowW8")
        ok = iso[2] < 0 and fill[0] >= -0.03
        adopt &= ok
        vs_g["better" if d_g[2] < 0 else "worse" if d_g[1] > 0 else "unclear"] += 1
        L.append(f"| {fl:g} | {jn:g} | {pct(d_g)} | {pct(iso)} | {pct(fill)} | {pct(_diff(co, cg, 'friendShareW8'))} | "
                 f"{pct(_diff(co, cg, 'showRate'))} | {pct(_diff(cg, g, 'isolatedLowW8'))} | {'yes' if ok else 'no'} |")
    return L, adopt, vs_g


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="cg_sim.mc.grid")
    ap.add_argument("--pool", default="pool_sf_city")
    ap.add_argument("--seeds", type=int, default=10, help="selection seeds 0..N-1")
    ap.add_argument("--holdout", type=int, default=0, help="re-run the --top combos on fresh seeds N..N+H-1")
    ap.add_argument("--top", type=int, default=2)
    ap.add_argument("--confirm", action="store_true", help="best held-out combo in all 25 cells (needs --holdout)")
    ap.add_argument("--fake-laya", action="store_true")
    ap.add_argument("--world", choices=["tables", "truth"], default="tables")
    ap.add_argument("--users", type=int, help="toy pool: first N personas")
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    a = ap.parse_args(argv)
    if a.confirm and not a.holdout:
        ap.error("--confirm needs --holdout (confirmation runs on held-out seeds)")
    w = build(a.pool, a.fake_laya, limit_users=a.users)
    fake = _fake(a.pool, a.fake_laya)
    cur = {k: w.params[k.split(".")[0]].get(k.split(".")[1]) for k in GRID}
    combos = [dict(zip(GRID, vals)) for vals in itertools.product(*GRID.values())]
    base = {k: None for k in GRID}  # current params
    run = lambda tasks: _run(w, a.world, tasks, a.workers)  # noqa: E731

    sel = range(a.seeds)
    rows = run([(c, "common_ground", s, 1.0, 1.0) for c in combos + [base] for s in sel]
               + [(base, "greedy", s, 1.0, 1.0) for s in sel])
    run_id = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ") + f"_{a.pool}_grid"
    out = data_dir() / "sim" / "runs" / run_id
    out.mkdir(parents=True, exist_ok=True)
    (out / "grid.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows))
    by = _index(rows)
    res = _rank(by, combos, base, sel)
    greedy, cg0 = by[(_key(base), "greedy", 1.0, 1.0)], by[(_key(base), "common_ground", 1.0, 1.0)]
    g_iso = ci95([greedy[s]["isolatedLowW8"] for s in greedy])
    c_iso = ci95([cg0[s]["isolatedLowW8"] for s in cg0])
    tag = (" **Exploratory, fake Laya: not evidence.** Confirm with real Laya tables (or `--world truth`) "
           "before a params PR." if fake else "")
    L = [f"# CG params grid: {run_id}", "",
         f"Center cell, selection seeds 0-{a.seeds - 1}, world={a.world}, real cg_matching={engine.ma.HAVE_MATCHING}, "
         f"Laya {'fake (render_state hash)' if fake else 'data/sim/laya_gt'}. Current params: {cur}. "
         f"params.yaml unchanged.{tag}",
         "", f"Baselines: greedy isolated {g_iso[0]:.1%} [{g_iso[1]:.1%}, {g_iso[2]:.1%}]; "
         f"CG at current params {c_iso[0]:.1%} [{c_iso[1]:.1%}, {c_iso[2]:.1%}].", "", *_table(res)]

    if a.holdout:
        top = [r[0] for r in res[:a.top]]
        ho = range(a.seeds, a.seeds + a.holdout)
        hrows = run([(c, "common_ground", s, 1.0, 1.0) for c in top + [base] for s in ho]
                    + [(base, "greedy", s, 1.0, 1.0) for s in ho])
        (out / "holdout.jsonl").write_text("".join(json.dumps(r) + "\n" for r in hrows))
        hres = _rank(_index(hrows), top, base, ho)
        L += ["", f"## Held-out (seeds {ho.start}-{ho.stop - 1}, center cell, top {a.top} from selection)", "",
              *_table(hres)]
        if a.confirm:
            best, grid_cells = hres[0][0], cells(w.params)
            crows = run([(c, pol, s, fl, jn) for fl, jn in grid_cells for s in ho
                         for c, pol in ((base, "greedy"), (base, "common_ground"), (best, "common_ground"))])
            (out / "confirm.jsonl").write_text("".join(json.dumps(r) + "\n" for r in crows))
            T, adopt, vs_g = _confirm_table(_index(crows), best, base, grid_cells)
            L += ["", f"## Confirmation: {', '.join(f'{k.split('.')[1]}={lab(v)}' for k, v in best.items())} "
                  f"vs CG current vs greedy, seeds {ho.start}-{ho.stop - 1}, all {len(grid_cells)} cells", "", *T, "",
                  f"ADOPT vs CG current (iso upper < 0 and fill >= -3 pts in every cell): {'yes' if adopt else 'no'}"
                  f"{' (exploratory, fake Laya)' if fake else ''}. vs greedy: worse {vs_g['worse']}, "
                  f"unclear {vs_g['unclear']}, better {vs_g['better']} of {len(grid_cells)}."]
    (out / "GRID.md").write_text("\n".join(L) + "\n")
    print(out / "GRID.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
