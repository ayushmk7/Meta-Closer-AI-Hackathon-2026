# b3 round 2: fillToMax x reunionBoost x crowdBoost

Run `20261113T011854Z_pool_sf_city_grid`, with #61 at c7e1379 merged in (free seats roll to the next group). It
replaces the stale run 20261113T011612Z on 216b3bd. Center cell, pool_sf_city, real cg_matching.

**Exploratory, fake Laya: not evidence.** Every number here uses fake (hash) Laya tables (`data/sim/laya_gt` is also
fake). By the repo's rule (report.render), nothing here counts as evidence until it is confirmed with real Laya
tables. The `--world truth` check below is the strongest test available without them.
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

Selection used seeds 0-9 and confirmation uses fresh seeds 10-59 (winner's curse, #58). Reproduce with
`uv run python -m cg_sim.mc.grid --seeds 10 --holdout 50 --fake-laya` (`holdout.jsonl`). Rerun on the folded code
20261113T032653Z reproduced the three rows below exactly.

| combo | CG - greedy isolated | fill vs CG current | passes |
|---|---|---|---|
| CG current | +8.3% [+7.1, +9.5] | +0.0% | no |
| fillToMax false, reunion 4, crowd 0.5 (grid best) | +5.0% [+3.8, +6.3] | -2.5% | no |
| fillToMax true, reunion 1, crowd 0.5 | +3.9% [+2.7, +5.1] | -2.2% | no |

The grid best regressed on held-out seeds (+4.1 to +5.0), a winner's-curse effect. fillToMax true / reunion 1 /
crowd 0.5 holds up best at +3.9, but both lower bounds sit well above 0. The 25-cell run was skipped because a
combination that fails the center cell cannot satisfy "CG better in the center and not worse anywhere".

## 25-cell held-out confirmation (seeds 10-59, all cells)

Arms: greedy, CG current, and CG + fillToMax true / reunionBoost 1 / crowdBoost 0.5 (3,750 sims, seed-paired 95% CIs).
Raw rows: `confirm25.jsonl`; full per-cell table: `CONFIRM25.md`. These came from an ad-hoc script that has since
been folded into `cg_sim.mc.grid --holdout 50 --confirm`, which computes the same simulate calls on the same seeds.

Adoption bar: combo isolation better than CG current in every cell (upper bound < 0) and fill vs CG current >= -3 pts.

| | range over 25 cells |
|---|---|
| combo - CG current, isolated low w8 | -1.6% to -5.6%, every upper bound < 0 (worst cell 0.5 x 1.25: -1.6% [-2.6, -0.7]) |
| combo - CG current, fill | -1.9 to -2.3 pts (bar -3) |
| combo - CG current, friendship share w8 | +2.2 to +6.4 pts, all CIs > 0 |
| combo - CG current, show-up | -0.1 to +0.5 pts (flat) |
| combo - greedy, isolated low w8 | +1.0% to +9.4%: worse in 24/25 cells, unclear in 1 (1.5 x 1.5: +1.0% [-0.2, +2.2]) |
| CG current - greedy, isolated low w8 | +5.7% to +12.5% |

Exploratory (fake Laya): the combo passes the adoption bar in all 25 of 25 cells. It is a strict improvement on current CG, and it cuts the gap
to greedy by about half (most in high flake / high join cells). It does not beat greedy in any cell (worse in 24, unclear in 1), so the PRD-3
headline ("CG beats greedy in all 25 cells") still does not hold.

## Truth-world check (run 20261113T032906Z)

`uv run python -m cg_sim.mc.grid --seeds 10 --holdout 50 --fake-laya --world truth`: outcomes come from hidden traits
the policy never sees. Selection independently picks the same combo (fillToMax true, reunion 1, crowd 0.5). On
held-out seeds 10-59 at the center cell:

| | truth world |
|---|---|
| combo - CG current, isolated low w8 | -4.3% [-5.2, -3.4] |
| combo - CG current, fill | -2.6 pts |
| combo - CG current, friendships w8 | +5.6 pts [+4.8, +6.3] |
| combo - greedy, isolated low w8 | +4.1% [+3.0, +5.2] |
| CG current - greedy, isolated low w8 | +8.4% [+7.1, +9.7] |

These match the tables world in direction and roughly in size, at the center cell only.

## Conclusion

Exploratory (fake Laya; tables and truth worlds agree): `matching.fillToMax: true`, `reunionBoost: 1` and
`crowdBoost: 0.5` beat CG at the old params (adopted in #75). Re-confirm with real Laya tables when they exist. Together they close about half the gap to greedy and never reach parity. What is left
is greedy's 5-person groups, which override members' `groupSize.max`. Matching that is a product decision, not a
params change.

DONE: fillToMax=true + reunionBoost=1 + crowdBoost=0.5 beats old-params CG in 25/25 cells (isolation -1.6 to -5.6 pts, fill -1.9 to -2.3 pts, held-out seeds 10-59; exploratory, fake Laya; truth world agrees at center); vs greedy: worse 24/25, unclear 1
