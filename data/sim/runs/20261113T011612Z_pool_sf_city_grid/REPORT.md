# b3 round 2: fillToMax x reunionBoost x crowdBoost

Run `20261113T011612Z_pool_sf_city_grid`. Center cell, 10 seeds, pool_sf_city, real cg_matching with #61 fillToMax
merged in, fake Laya. Round 1 is in `../20261113T010133Z_pool_sf_city_grid/REPORT.md`. Relative results only.

Baselines: greedy isolated w8 51.8% [49.9, 53.7]; CG current 60.4% [58.1, 62.7].

| fillToMax | reunion | crowd | CG - greedy isolated | fill vs CG current | mean group | liked repeat pairs |
|---|---|---|---|---|---|---|
| false | 4 | 0.5 | +4.1% [+1.8, +6.4] | -2.5% | 3.71 | 124 |
| false | 4 | 0 | +5.1% [+2.9, +7.3] | -0.7% | 3.69 | 122 |
| false | 1 | 0 | +5.9% [+3.5, +8.3] | -0.2% | 3.68 | 120 |
| false | 0 | 0 | +8.6% [+6.5, +10.6] | +0.0% | 3.66 | 107 |
| true | 4 | 0.5 | +8.6% [+6.8, +10.4] | -2.5% | 3.98 | 114 |
| true | 1 | 0 | +8.8% [+7.2, +10.4] | -0.1% | 3.97 | 109 |
| true | 0 | 0 | +12.6% [+10.8, +14.3] | +0.3% | 3.95 | 95 |
| greedy | | | | | 5.14 | 165 |

Full table: `GRID.md`.

- No combination passes. The best is unchanged from round 1 (fillToMax false, reunion 4, crowd 0.5), and its lower
  95% bound is +1.8%, nowhere near 0.
- fillToMax hurts, by about 3 to 4 points of isolation in every pairing. Group size only rises from 3.66 to 3.95,
  because members' own `groupSize.max` still stops the pick loop, while greedy ignores it (5.14). Liked repeat pairs
  fall (107 to 95). Likely cause: when the remainder `seats % hi` is below `strangerSizeMin`, it is left unseated
  instead of being split into balanced groups. Groups that stop early on `umax` also do not re-split, so fewer
  people meet. That is a hypothesis from reading `core.py` and has not been measured separately.
- 50-seed x 25-cell confirmation: skipped. The best combination fails at 10 seeds by a wide margin (it is the
  round-1 best), so 50 seeds cannot flip the center-cell result. Command, if it is wanted anyway:
  copy `contracts/`, set `matching.reunionBoost: 4` and `matching.crowdBoost: 0.5` in the copy's params.yaml, then run
  `CG_CONTRACTS_DIR=<copy> uv run cg-sim run --pool pool_sf_city --fake-laya --cells all --seeds 50 --policies greedy,common_ground --no-ablate`.

The gap to greedy is the size of greedy's groups, which ignore members' stated maximum. Closing it inside the
rules means either relaxing `groupSize.max` (a product decision) or changing the target metric. More boosts will
not do it.

DONE: none (best = fillToMax false, reunionBoost 4, crowdBoost 0.5; CG - greedy +4.1% [+1.8, +6.4]; fails the pass rule)
