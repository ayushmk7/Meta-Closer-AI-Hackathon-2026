import copy, dataclasses
from concurrent.futures import ProcessPoolExecutor
from cg_sim.mc import engine
from cg_sim.mc.world import build, ci95
W = build("pool_sf_city", True)
COMBOS = {"base": {}, "F/r4/c0.5": {"fillToMax": False, "reunionBoost": 4, "crowdBoost": 0.5},
          "T/r1/c0.5": {"fillToMax": True, "reunionBoost": 1, "crowdBoost": 0.5}}
SEEDS = range(10, 60)  # held out: grid selected on 0-9
def one(a):
    name, pol, s = a
    p = copy.deepcopy(W.params); p["matching"].update(COMBOS[name])
    m = engine.simulate(dataclasses.replace(W, params=p), pol, s)
    return name, pol, s, m["isolatedLowW8"], m["fillRate"]
if __name__ == "__main__":
    t = [(c, "common_ground", s) for c in COMBOS for s in SEEDS] + [("base", "greedy", s) for s in SEEDS]
    with ProcessPoolExecutor(14) as ex: rows = list(ex.map(one, t, chunksize=2))
    R = {(n, p, s): (i, f) for n, p, s, i, f in rows}
    for c in COMBOS:
        d = ci95([R[(c, "common_ground", s)][0] - R[("base", "greedy", s)][0] for s in SEEDS])
        f = ci95([R[(c, "common_ground", s)][1] - R[("base", "common_ground", s)][1] for s in SEEDS])
        print(f"{c}: CG-greedy iso {d[0]:+.1%} [{d[1]:+.1%}, {d[2]:+.1%}]  fill vs CG {f[0]:+.1%}  pass={d[2] < 0 and f[0] >= -0.05}")
