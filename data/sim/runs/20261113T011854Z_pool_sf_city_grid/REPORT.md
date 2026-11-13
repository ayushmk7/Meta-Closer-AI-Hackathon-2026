# b3 round 2: fillToMax x reunionBoost x crowdBoost

Run `20261113T011854Z_pool_sf_city_grid`, with #61 at c7e1379 merged in (free seats roll to the next group). It
replaces the stale run 20261113T011612Z on 216b3bd. Center cell, pool_sf_city, real cg_matching, fake Laya.
Round 1: `../20261113T010133Z_pool_sf_city_grid/REPORT.md`. Relative results only.

## Selection grid (seeds 0-9)

Baselines: greedy isolated w8 51.8% [49.9, 53.7]; CG current 60.4% [58.1, 62.7].

| fillToMax | reunion | crowd | CG - greedy isolated | fill vs CG current | mean group | liked repeat pairs |
|---|---|---|---|---|---|---|
| false | 4 | 0.5 | +4.1% [+1.8, +6.4] | -2.5% | 3.71 | 124 |
| true | 1 | 0.5 | +4.4% [+2.2, +6.6] | -2.0% | 3.93 | 135 |
| true | 1 | 0 | +4.6% [+2.7, +6.4] | -0.1% | 3.92 | 130 |
| false | 4 | 0 | +5.1% [+2.9, +7.3] | -0.7% | 3.69 | 122 |
| true | 4 | 0 | +5.2% [+3.2, +7.2] | -0.4% | 3.92 | 127 |
| true | 0 | 0 | +7.1% [+4.5, +9.8] | +0.2% | 3.90 | 115 |
| false | 0 | 0 | +8.6% [+6.5, +10.6] | +0.0% | 3.66 | 107 |
| greedy | | | | | 5.14 | 165 |

Full table: `GRID.md`. With the c7e1379 fix, fillToMax helps: alone it moves the gap from +8.6 to +7.1, and with
reunionBoost it gives the most liked repeat pairs CG reaches (135). Group size still stops near 3.9, because
members' own `groupSize.max` caps it while greedy (5.1) ignores it.

## Held-out confirmation (seeds 10-59, center cell)

Selection used seeds 0-9 and confirmation uses fresh seeds 10-59 (winner's curse, #58). Script: `holdout.py`.

| combo | CG - greedy isolated | fill vs CG current | passes |
|---|---|---|---|
| CG current | +8.3% [+7.1, +9.5] | +0.0% | no |
| fillToMax false, reunion 4, crowd 0.5 (grid best) | +5.0% [+3.8, +6.3] | -2.5% | no |
| fillToMax true, reunion 1, crowd 0.5 | +3.9% [+2.7, +5.1] | -2.2% | no |

The grid best regressed on held-out seeds (+4.1 to +5.0), a winner's-curse effect. fillToMax true / reunion 1 /
crowd 0.5 holds up best at +3.9, but both lower bounds sit well above 0. The 25-cell run was skipped because a
combination that fails the center cell cannot satisfy "CG better in the center and not worse anywhere".

## Conclusion

The b3 levers together close about half the gap (from +8.3 to +3.9 held out) but never reach parity. What is left
is greedy's 5-person groups, which override members' `groupSize.max`. Matching that is a product decision, not a
params change.

DONE: none (best held out = fillToMax true, reunionBoost 1, crowdBoost 0.5; CG - greedy +3.9% [+2.7, +5.1], seeds 10-59)
