# b3 isolation: reunionBoost / crowdBoost grid

Run `20261113T010133Z_pool_sf_city_grid`. Center cell (flake 1.0, join 1.0), pool_sf_city, real cg_matching
(with #51 reunionBoost + crowdBoost), fake Laya. Relative results only; params.yaml unchanged.

## 1. Diagnostic (5 seeds)

| policy | met pairs | repeat co-attend (>=2 of met) | liked repeat pairs | mean group | isolated low w8 |
|---|---|---|---|---|---|
| greedy | 1824 | 38.4% | 159 | 5.14 | 52.9% |
| CG, cands={} (before) | 1131 | 31.3% | 78 | 3.65 | 64.3% |
| CG, real cands (this PR) | 1099 | 33.6% | 103 | 3.65 | 60.2% |

DIAG: greedy repeats 38.4% vs cg 31.3%.

The reunion hypothesis holds only partly. Greedy's repeat rate is 1.2x CG's, not "far more". The bigger gap is
group size: greedy chunks at the plan's `size.max` (5.1 people, about 10 pairs per meetup), while
`form_groups` splits at the median member's own `groupSize.max` (3.6 people, about 5 pairs). Greedy meets 1.6x as
many pairs, and friendships follow pair volume.

## 2. Engine fix

`_cg_form` passed `cands={}`, so `pair()` scored every pair 0 and group splits followed queue order. The world now
computes `cg_matching.candidates` once and `_cg_form` passes it. Met pairs already reached `form_groups` via
`metIds`, and `state` stays `{}` because venue capacity never binds in this pool. Effect: CG isolated w8
64.3% -> 60.2%, liked repeat pairs 78 -> 103.

## 3. Grid (10 seeds)

Pass rule: seed-paired 95% upper bound of CG - greedy on `isolatedLowW8` < 0, and fill vs CG current >= -5 pts.
Baselines: greedy 51.8% [49.9, 53.7]; CG current (cands fix) 60.4% [58.1, 62.7]. The 0/0 row equals the baseline
(fill diff exactly +0.0%), so the boosts are off when absent.

| reunionBoost | crowdBoost | CG isolated w8 | CG - greedy isolated | fill vs CG current | passes |
|---|---|---|---|---|---|
| 4 | 0.5 | 55.9% [53.4, 58.4] | +4.1% [+1.8, +6.4] | -2.5% | no |
| 2 | 1 | 56.2% [54.2, 58.3] | +4.4% [+2.0, +6.8] | -3.1% | no |
| 0.5 | 0.5 | 56.5% [55.3, 57.7] | +4.7% [+2.8, +6.6] | -2.1% | no |
| 4 | 0 | 56.9% [55.7, 58.2] | +5.1% [+2.9, +7.3] | -0.7% | no |
| 0.5 | 0 | 57.0% [54.4, 59.7] | +5.2% [+2.8, +7.6] | +0.0% | no |
| 0 | 0.5 | 59.7% [57.2, 62.1] | +7.9% [+4.8, +10.9] | -2.3% | no |
| 0 | 0 | 60.4% [58.1, 62.7] | +8.6% [+6.5, +10.6] | +0.0% | no |

Full 20-row table: `GRID.md`.

No combination passes. reunionBoost alone (0.5 to 4) cuts the gap from 8.6 to about 5 points at no fill cost.
crowdBoost alone (the plan's fallback) buys under 1 point and costs 2 to 3 points of fill. Every lower 95% bound
stays above 0, so no combination gets close to the bar. The 50-seed x 25-cell confirmation was skipped because
no combination won.

## 4. Recommendation

- Do not change `contracts/params.yaml` for b3. If a partial win is wanted anyway, `reunionBoost: 0.5` is
  free on fill (-4 pts isolated vs CG current). It still needs its own 50-seed x 25-cell run before any params PR.
- The remaining lever is group size, which is a cg_matching decision. Splitting at the plan's `size.max` (or
  upper median) instead of the median member's `groupSize.max` would match greedy's pair volume. That trades
  against members' own size preferences, so it is for the orchestrator and bmatch to decide, not the sim.

DONE: none (reunionBoost and crowdBoost fallback both fail the pass rule at the center cell, 10 seeds)
