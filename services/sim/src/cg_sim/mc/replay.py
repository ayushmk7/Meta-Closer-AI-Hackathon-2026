"""replay.json: one representative seed per policy, for the dashboard Replay page (PRD-3 §8).

Written by `cg-sim run` to data/sim/runs/<runId>/replay.json. The dashboard mirrors this shape.
Tolerant reader: ignore unknown keys; new keys may be added, existing ones never change meaning.

{
  "version": 1,
  "runId": "20261112T1830Z_pool_sf_city_fake",   # str, also the directory name
  "poolId": "pool_sf_city",
  "seed": 0,                                     # which MC seed is replayed (same for all policies)
  "cell": {"flake": 1.0, "join": 1.0},           # sweep multipliers of the replayed cell
  "weeks": 8,
  "policies": ["random", "greedy", "common_ground"],   # order to show; dashboard shows greedy vs common_ground
  "people": [                                    # static, same for every policy
    {"userId": "u_0001", "lat": 37.76, "lng": -122.43, "sceneId": "sc_trail", "lowOutgoing": false}
  ],
  "venues": [{"venueId": "vn_lands_end", "name": "Lands End Trail", "lat": 37.78, "lng": -122.51}],
  "frames": {                                    # per policy, one frame per week, week 1..weeks (cumulative state at week end)
    "greedy": [
      {
        "week": 1,
        "isolatedShareLowOut": 0.92,             # share of low-outgoing people with zero friendships so far
        "friendshipShare": 0.03,                 # share of everyone with >= 1 friendship so far
        "meetups": [                             # meetups that happened THIS week (>= 2 showed)
          {"planId": "pl_x", "venueId": "vn_lands_end", "activityType": "walk",
           "day": 3,                             # sim day index 0..weeks*7-1
           "memberIds": ["u_0001", "u_0007", "u_0042"],   # seated
           "showedIds": ["u_0001", "u_0042"]}
        ],
        "metPairs": [["u_0001", "u_0042"]],      # pairs first met THIS week (a < b)
        "friendships": [["u_0001", "u_0042"]]    # pairs that became friends THIS week (a < b)
      }
    ],
    "common_ground": [...],
    "random": [...]
  },
  "isolatedShare": {                             # chart: low-outgoing isolated share, over all seeds of this cell
    "greedy": {"week": [0, 1, ..., 8], "mean": [1.0, ...], "lo": [...], "hi": [...]},   # 95% interval over seeds
    "common_ground": {...},
    "random": {...}
  }
}

Cumulative state at week w = union of metPairs / friendships over frames 1..w.
Pairs are always sorted [a, b] with a < b lexicographically.
"""

from cg_sim.mc.world import World, cells, ci95


def band(rows: list[dict], policy: str, cell: int, weeks: int) -> dict:
    """mean / 95% interval over seeds of isolatedLowByWeek for one policy and cell (base variant)."""
    series = [r["isolatedLowByWeek"] for r in rows
              if r["variant"] == "base" and r["policy"] == policy and r["cell"] == cell]
    stats = [ci95([s[k] for s in series]) for k in range(weeks + 1)]
    return {"week": list(range(weeks + 1)), "mean": [s[0] for s in stats],
            "lo": [s[1] for s in stats], "hi": [s[2] for s in stats]}


def build(world: World, run_id: str, traces: dict[str, list[dict]], rows: list[dict], center: int) -> dict:
    flake, join = cells(world.params)[center]
    return {
        "version": 1, "runId": run_id, "poolId": world.pool_id, "seed": 0,
        "cell": {"flake": flake, "join": join}, "weeks": world.weeks, "policies": list(traces),
        "people": world.people, "venues": world.venues, "frames": traces,
        "isolatedShare": {p: band(rows, p, center, world.weeks) for p in traces},
    }
