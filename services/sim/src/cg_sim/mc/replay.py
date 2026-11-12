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
