"""confirm25.jsonl -> per-cell markdown table (seed-paired 95% CIs). Adoption bar: combo isolation < CG current
(upper bound < 0) in all 25 cells and fill vs CG current >= -3 pts."""
import json, sys
from collections import defaultdict
from cg_sim.mc.world import ci95
d = defaultdict(dict)
for l in open(f"{sys.argv[1]}/confirm25.jsonl"):
    r = json.loads(l); d[(r["cell"], r["arm"])][r["seed"]] = r
pct = lambda t: f"{t[0]:+.1%} [{t[1]:+.1%}, {t[2]:+.1%}]"
diff = lambda a, b, k: ci95([a[s][k] - b[s][k] for s in a])
L = ["| flake | join | combo - greedy iso | combo - CG iso | combo - CG fill | combo - CG friends w8 | combo - CG show | CG - greedy iso | beats CG |",
     "|---" * 9 + "|"]
ok_all, cg_better_greedy = True, 0
for c in sorted({c for c, _ in d}):
    g, cg, co = d[(c, "greedy")], d[(c, "cg")], d[(c, "combo")]
    x = next(iter(co.values()))
    iso, fill = diff(co, cg, "isolatedLowW8"), diff(co, cg, "fillRate")
    ok = iso[2] < 0 and fill[0] >= -0.03
    ok_all &= ok
    cg_better_greedy += diff(co, g, "isolatedLowW8")[2] < 0
    L.append(f"| {x['flake']:g} | {x['join']:g} | {pct(diff(co, g, 'isolatedLowW8'))} | {pct(iso)} | {pct(fill)} | "
             f"{pct(diff(co, cg, 'friendShareW8'))} | {pct(diff(co, cg, 'showRate'))} | {pct(diff(cg, g, 'isolatedLowW8'))} | {'yes' if ok else 'no'} |")
print("\n".join(L))
print(f"\nADOPT={ok_all}  combo beats greedy (iso upper<0) in {cg_better_greedy}/25 cells")
