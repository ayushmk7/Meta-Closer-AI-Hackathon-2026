"""Held-out 25-cell confirmation: CG combo vs CG current vs greedy, seeds 10-59 (selection used 0-9).

    uv run python <this> <out_dir>   ->  <out_dir>/confirm25.jsonl
"""
import copy, dataclasses, json, sys
from concurrent.futures import ProcessPoolExecutor
from cg_sim.mc import engine
from cg_sim.mc.world import build, cells
W = build("pool_sf_city", True)
COMBO = {"fillToMax": True, "reunionBoost": 1, "crowdBoost": 0.5}
W2 = dataclasses.replace(W, params={**copy.deepcopy(W.params), "matching": {**W.params["matching"], **COMBO}})
K = ("isolatedLowW8", "fillRate", "friendShareW8", "showRate")
def one(a):
    name, ci, (fl, jn), s = a
    w, pol = {"greedy": (W, "greedy"), "cg": (W, "common_ground"), "combo": (W2, "common_ground")}[name]
    m = engine.simulate(w, pol, s, fl, jn)
    return {"arm": name, "cell": ci, "flake": fl, "join": jn, "seed": s, **{k: m[k] for k in K}}
if __name__ == "__main__":
    t = [(n, ci, c, s) for ci, c in enumerate(cells(W.params)) for s in range(10, 60) for n in ("greedy", "cg", "combo")]
    with ProcessPoolExecutor(14) as ex, open(f"{sys.argv[1]}/confirm25.jsonl", "w") as f:
        for r in ex.map(one, t, chunksize=4):
            f.write(json.dumps(r) + "\n")
