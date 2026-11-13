# Simulation (`services/sim`, `services/dashboard`)

`cg-sim` (`services/sim/src/cg_sim`) does four jobs: it generates the seed pools, precomputes Laya tables ([laya.md](laya.md)), evaluates extraction against ground truth, and runs the Monte Carlo that compares the matching policy with baselines. It imports `cg_matching` through `matching_adapter.py`, so the sim and the product run the same `rank_plans` / `form_groups` code and the same `contracts/params.yaml` ([matching-ml.md](matching-ml.md)).

Naming: the product now calls plans **Meetups** in user-facing copy (rebrand; #147 changed the two pool descriptions in `data/seed/*/pool.json` to "Meetups near you in San Francisco" and "Meetups with people at this event, Nov 11 to 13"). Code, contracts, params, report and dashboard labels keep `plan`, and so does this doc.

`services/sim/STATUS.md` is stale (it lists M1 Laya and M2 Monte Carlo as "not started"); trust the code and this page.

## Commands

All commands run from `services/sim` with `uv run`. `cli.py` dispatches `cg-sim <cmd>` to `cg_sim.<module>.main(argv)`: `seed` → `cg_sim.seed`, `eval` → `cg_sim.evalx`, `precompute` → `cg_sim.precompute`, `run` → `cg_sim.mc`, `report` → `cg_sim.report`. `grid` and `tune` are modules, not subcommands.

| Command | Does | Writes |
| --- | --- | --- |
| `cg-sim seed [--pool ID] [--seed N] [--fake-muse]` | Regenerate a pool (default every pool, seed `matching.rngSeedDefault` 7), then validate it | `data/seed/<pool>/*`, `data/sim_private/<pool>/*` |
| `cg-sim seed --check [--pool ID]` | Validate the committed seed only, then run `scripts/validate_contracts.py` | nothing |
| `cg-sim eval [--pool ID] [--use-ground-truth] [--run-id ID] [--out PATH]` | Extraction and sensitive-gate precision/recall vs ground truth | `data/sim/runs/<runId>/extraction.json` (default run id `eval-latest`) |
| `cg-sim precompute [--pool ID] [--fake-laya] [--use-ground-truth] [--out DIR] [--no-reload]` | Laya tables; details in [laya.md](laya.md#precompute) | `data/laya_tables/<pool>/` or, with `--use-ground-truth`, `data/sim/laya_gt/<pool>/` |
| `cg-sim run [flags below]` | Monte Carlo | `data/sim/runs/<runId>/{config.json, results.jsonl, replay.json}` |
| `cg-sim report [--run-id ID]` | Render a run | `<run>/REPORT.md`, `<run>/isolated_share.png` |
| `uv run python -m cg_sim.mc.grid [flags]` | Params grid with held-out confirmation | `data/sim/runs/<ts>_<pool>_grid/{grid,holdout,confirm}.jsonl, GRID.md` |
| `uv run python -m cg_sim.mc.tune [flags]` | Learning-loop (prefs) tune | `data/sim/runs/<ts>_<pool>_tune/{tune.jsonl, REPORT.md}` |

Makefile wrappers (default `POOL=pool_sf_city`): `make sim-seed`, `make sim-precompute` (backend export, needs the API), `make sim-run`.

### `precompute`: with and without `--use-ground-truth`

| | Without (default) | With `--use-ground-truth` |
| --- | --- | --- |
| Input | `GET {CG_INTERNAL_URL}/internal/v1/pools/<id>/export` (default `http://127.0.0.1:9001`); the backend must be running with the pool loaded | Export rebuilt from `data/seed` + `data/sim_private` (`seed.export.load_ground_truth_export`, signals from connected providers) |
| Output | `data/laya_tables/<pool>/` | `data/sim/laya_gt/<pool>/` |
| After | `POST /internal/v1/laya-tables/reload` unless `--no-reload` | never reloads |
| Consumer | backend | `cg-sim run`, grid, tune |

Ground-truth tables never go to `data/laya_tables/` (PRD-3 §2). Both modes use real laya-serve at `LAYA_URL` unless `--fake-laya` or `LAYA_FAKE=1`. Do not run the default mode against the live demo backend: it reloads that backend's tables.

### `run`

| Flag | Default | Meaning |
| --- | --- | --- |
| `--pool` | `pool_sf_city` | |
| `--fake-laya` | off | Build hash tables in memory instead of reading `data/sim/laya_gt/<pool>/`. Without it, the run exits 2 if that directory has no `activity.parquet`. |
| `--seeds N` | `sim.seeds` 50 | Seeds 0..N-1 |
| `--cells all\|center` | `all` | All 25 sweep cells, or only flake × join = 1.0 × 1.0 |
| `--weeks N` | `sim.weeks` 8 | |
| `--users N` | all | Toy pool: the first N personas, biggest scenes first |
| `--world tables\|truth` | `tables` | Outcome model (below) |
| `--policies a,b,...` | `random,greedy,common_ground` | Must include `greedy` and `common_ground`; add `common_ground_learned` (about +33% run time) |
| `--no-ablate` | ablations on | Skip the ablation variants |
| `--workers N` | CPUs − 1 | Process pool |
| `--run-id ID` | `<UTC ts>_<pool>_<fake\|laya>_<world>` | Output directory name |

`results.jsonl` has one row per (variant, policy, cell, seed) with every metric. `replay.json` is one traced run (seed 0, center cell, every policy) for the dashboard. `config.json` records `fakeLaya` from the **flag**, not from the manifest (see Caveats).

Ablations (common_ground only, center cell, one override each, `mc/__init__.py` `ABLATIONS`): `feed.maxPerActivityType=4`; caps lifted (type 8, scene 8, `fillLikelihoodFloor` 0); `exposureCapPerDay` 20, 80, 10; `exposureCapPerDay=10` with `isolationBoost` 0 and 1; `isolationBoost` 0 and 1; `formLeadHours` 12 and 48. At the default cap (40/day) no plan hits the cap in this pool, so the cap-10 variants are the ones where `isolationBoost` has something to reorder.

### `report`

Without `--run-id` it picks the **lexicographically last** directory under `data/sim/runs/` that has a `results.jsonl`. Today that is `real_laya_center` (letters sort after digits), not the newest timestamp. The dashboard's `/api/replay` instead picks the newest `replay.json` by file mtime.

A claim ("Common Ground is better than greedy on X") is stated only if the seed-paired 95% interval of (common_ground − greedy) favours Common Ground in every cell that was run; with `fakeLaya` true every claim is downgraded to "not evidence". Metrics in the report: isolated low-outgoing at week 8, friendship share at weeks 4 and 8, fill rate, join-to-meetup rate, show-up rate, Gini of friend counts, median days to first meetup, low-outgoing seated at least once.

### `grid`

```sh
uv run python -m cg_sim.mc.grid [--pool P] [--seeds 10] [--holdout 50 [--top 2] [--confirm]] [--fake-laya] [--world tables|truth] [--users N] [--workers N]
```

Current grid (`GRID` in `mc/grid.py`): `matching.fillToMax` ∈ {false, true} × `matching.reunionBoost` ∈ {0, 1, 4} × `matching.crowdBoost` ∈ {0, 0.5} = 12 combos, plus "current params" as the baseline. An earlier grid (run `20261112T231245Z`) swept the feed caps, fill floor and `isolationBoost`; none passed, so the levers were replaced.

1. **Selection**: every combo plus current params for common_ground, and greedy, at the center cell on seeds 0..`seeds`−1 → `grid.jsonl`. Ranked by mean (CG − greedy) isolated-low at week 8. "passes" = CG beats greedy (upper bound < 0) with fill vs current ≥ −5 pts.
2. **Held out** (`--holdout N`): the `--top` combos re-run on fresh seeds `seeds`..`seeds+N−1` → `holdout.jsonl`.
3. **Confirm** (`--confirm`, needs `--holdout`): the best held-out combo vs CG at current params vs greedy in all 25 cells on the held-out seeds → `confirm.jsonl`. Adoption bar: isolation better than current CG in every cell (upper bound < 0) and fill vs current ≥ −3 pts in every cell.

`GRID.md` labels every verdict "Exploratory, fake Laya: not evidence" when `--fake-laya` is passed or the pool's `laya_gt` manifest says `fake` (or is missing). Greedy ignores these params.

### `tune`

```sh
uv run python -m cg_sim.mc.tune [--pool P] [--seeds 20] [--weeks 8] [--fake-laya] [--workers N] [--from <runId>]
```

`common_ground_learned` over `prefAlpha` ∈ {0.1, 0.3, 0.6, 0.9} × `prefBoost` ∈ {0.3, 0.6, 1.0, 1.5} × reward source `sim.learnFrom` ∈ {`all`, `meet_again`} (32 settings), center cell. Selected on seeds 0..N−1 (a metric must clear 0 and no metric's mean may be worse by more than 2 pts), then reported on held-out seeds N..2N−1 against plain common_ground on the same seeds. A metric is "confirmed" only if it clears 0 on both. `--from` re-renders `REPORT.md` from an existing `tune.jsonl`. `sim.learnFrom` is a sim-only knob, never in `params.yaml`.

## Held-out seeds: why

Picking the best of many noisy settings on some seeds and then reporting its number on the same seeds overstates it (winner's curse). Every tuning tool here separates the two: grid selects on seeds 0-9 and reports on 10-59; tune selects on 0-19 and reports on 20-39. All comparisons are seed-paired 95% intervals (`ci95` of per-seed differences, mean ± 1.96 × sd / √n). Common random numbers make the pairing meaningful: every draw comes from `np.random.default_rng([seed, day, purpose])`, so all policies and cells see identical random streams and differ only in their decisions.

## World and engine

### World (`mc/world.py` `build`)

Built once per pool and shipped to worker processes.

- **People**: personas from `data/seed/<pool>/personas.jsonl` (`pool_sf_city`: 300 + `u_maya` = 301; `pool_evt_closer_together`: 80). Hidden traits come from `data/sim_private/<pool>/latent.jsonl`: `lowOutgoing` (about `sim.lowOutgoingShare` 0.33), `outgoingness`, `flakiness`. The policies never see them.
- **Venues**: `venues.jsonl` minus sensitive venues (`pool_sf_city` 80, event pool 25).
- **Plans**: for each week w, `propose_plans` on the ground-truth export with `scene_of` from ground truth, rng `"<pool>|w<w>"`, horizon start `DAY0 + 7w` (`DAY0` = 2026-11-13 local midnight, America/Los_Angeles). Plans whose venue lacks the activity type or is closed are dropped. A week-w plan is shown from day 7(w−1) (a week ahead), forms at `startsAt − plans.formLeadHours` (24 h), and only plans starting inside the horizon are kept (960 plans over 8 weeks for `pool_sf_city`).
- **Eligibility** (for random and greedy): availability slot of the start time and travel within `travel.maxMinutes` (fastest of the user's modes; event pools skip the travel check). Busy blocks only cover 14 days, so the 8-week sim uses availability slots everywhere.
- **Fit**: max over the plan's target interests of the user's interest vector weight.
- **Tables**: `data/sim/laya_gt/<pool>/` (missing p_join/p_show default 0.5, missing p_meet_again 0.2), or with `--fake-laya` the hash tables built in memory. With fake tables `p_join` is multiplied by fit, because the hash is blind to interests and an irrelevant impression should convert at about 0.
- **Candidates**: `cg_matching.candidates`, used by `form_groups` for pair affinity.

### Policies (`mc/engine.py`)

| Policy | Carousel (≤ `feed.size` 8 per person per day) | Formation |
| --- | --- | --- |
| `random` | Random eligible, not-yet-joined plans | First come, chunks of `size.max`; a last chunk under `size.min` is dropped |
| `greedy` | Most-joined first (count × 10), then fit; eligible and fit > 0; no caps, no boosts, no diversity | Same first-come chunks |
| `common_ground` | The real `rank_plans` with live joiners as `seedJoinIds` and live met pairs as `metIds`, rng `"<seed>\|<day>"` | The real `form_groups` on a mini pool of the interested people (state `{}`: venue capacity and seat history are not modelled) |
| `common_ground_learned` | Same, plus `MatchState.prefs` learned with `cg_matching.update_prefs` | Same |

### Daily tick

For each day: (1) carousels for plans currently open; (2) joins: an impression converts if `u < p_join × join_multiplier × JOIN_DAILY × fatigue`, where `JOIN_DAILY = 0.5` (a calibration knob, not a contract param) and fatigue falls linearly to 0 at `plans.openJoinsMax` (5) open joins, with the cap enforced exactly; (3) formation for plans whose form day is today; (4) meetups: each seated person shows if `u < 1 − (1 − p_show) × flake_multiplier`; every pair that both showed is "met", and the pair "liked" each other if `u < p_meet_again`; (5) weekly state on day 6 of each week.

A **friendship** is a pair that liked each other at `sim.friendshipMeetups` (2) meetups. Learned prefs (`common_ground_learned`): after each meetup, +0.5 on the plan's keys for a person who showed and liked someone, −0.5 otherwise; with `learnFrom=all` a no-show also gets −0.5.

`--world truth` (stretch check): outcomes also depend on traits the policy never sees: `p_join × (0.5 + outgoingness)` and `p_show × (1 − 0.5 × flakiness)`. With `tables`, the policy ranks on the same p_join/p_show the world draws from.

### Sweep cells

`sim.sweepMultipliers` [0.5, 0.75, 1.0, 1.25, 1.5] applied to flake rate × join rate = 25 cells, row-major; 1.0 × 1.0 (index 12) is the center and replay cell.

### Metrics (`engine.simulate`)

| Key | Definition |
| --- | --- |
| `isolatedLowW8` | Share of low-outgoing people with **no friendship** at the end of week 8 (the headline; not "never met anyone") |
| `friendShareW4`, `friendShareW8` | Share of everyone with ≥ 1 friendship at weeks 4 and 8 |
| `fillRate` | Share of plans forming before the horizon that formed at least one group |
| `joinToMeetup` | Attendances (in groups where ≥ 2 showed) / joins |
| `showRate` | Showed / seated |
| `giniFriends` | Gini of friend counts |
| `medianDaysFirstMeetup` | Median day of a person's first attended meetup (people who had one) |
| `lowSeatedShare` | Share of low-outgoing people seated in a group at least once |
| `repeatCoattendShare`, `repeatLikedShare`, `metPairs`, `repeatLikedPairs` | Reunion diagnostics: met pairs that co-attended / mutually liked ≥ 2 meetups |
| `meanGroupSize` | Mean seated group size |
| `isolatedLowByWeek`, `friendShareByWeek`, `showRateByWeek` | Weekly series |

## Results

Tables: `data/sim/laya_gt/pool_sf_city/manifest.json` says `"layaModel": "laya"` (real laya-serve 0.2.1, #138, commit 967109f). `data/sim/laya_gt/pool_evt_closer_together/manifest.json` still says `"layaModel": "fake"`. Every run directory before 967109f used fake (hash) tables.

| Run (`data/sim/runs/`) | Laya | What |
| --- | --- | --- |
| `20261112T224057Z_pool_sf_city_fake_tables` | fake | First full run |
| `20261112T231245Z_pool_sf_city_grid` | fake | Grid over caps / fill floor / `isolationBoost`: nothing passed |
| `20261113T010133Z_pool_sf_city_grid` | fake | reunion × crowd, round 1 |
| `20261113T011854Z_pool_sf_city_grid` | fake | fillToMax × reunion × crowd, round 2; `REPORT.md` is the write-up for #62 |
| `20261113T012543Z_pool_sf_city_tune` | fake | Learning-loop tune |
| `20261113T032653Z_pool_sf_city_grid` | fake | Same grid on the folded code, with held-out and 25-cell confirm (the numbers below) |
| `20261113T032906Z_pool_sf_city_grid` | fake, `--world truth` | Truth-world check of the same grid |
| `real_laya_center` | **real** | 20 seeds, center cell, 4 policies (#138) |
| `eval-latest` | real | Extraction eval (`extraction.json`) |

### Real-Laya run (`real_laya_center`)

`pool_sf_city`, 301 people, 960 plans, 8 weeks, 20 seeds, center cell, `world=tables`, `--no-ablate`. Means with 95% intervals over seeds, from `data/sim/runs/real_laya_center/REPORT.md`:

| Metric | random | greedy | common_ground | common_ground_learned |
| --- | --- | --- | --- | --- |
| Low-outgoing still isolated, week 8 | 88.2% | **33.3%** [31.8, 34.8] | 37.2% [35.9, 38.5] | 37.9% |
| Low-outgoing seated at least once | 96.9% | 84.7% | **92.7%** [92.5, 92.9] | 92.8% |
| ≥ 1 friendship, week 8 | 13.4% | 68.0% | 65.0% | 65.1% |
| Plan fill rate | 93.5% | 83.3% | 77.6% | 77.4% |
| Show-up rate | 36.9% | 58.3% | 56.6% | 56.6% |
| Median days to first meetup | 8.00 | 4.45 | 7.95 | 7.95 |

Against greedy at the center cell, Common Ground is better only on "low-outgoing seated at least once" (the report's only "yes" claim) and worse on the other metrics, with the Gini of friend counts unclear. Learned prefs vs plain CG: every difference unclear.

**Pitch wording** (`HUMAN_TODO.md` §7, #139): Common Ground "includes the people others miss": it seats 92.7% of low-outgoing people at least once vs greedy's 84.7%, and it is far better than random on isolation (37.2% vs 88.2%). The adopted params are better than the previous ones (fake-Laya confirm below). Do not claim "beats greedy" or "best show-up" (greedy 58.3% vs CG 56.6%), and present the learning loop as learning, not proven.

### Extraction eval (`eval-latest`, backend export, real Laya)

| Measure | Precision | Recall |
| --- | --- | --- |
| Interests, leaf | 0.64 | 0.98 |
| Interests, level 2 | 0.58 | 0.97 |
| Sensitive places | 1.0 | 1.0 (30/30) |
| Frequent places | 0.80 | 0.76 |
| Sensitive interests | 0.0 | 0.0 (26 actual, 238 predicted) |
| Routines | n/a | 0.0 (79 actual) |

Sensitive interests rely on the taxonomy's sensitive flags, not on Laya; routines are not detected.

## How results fed params

Process (`params.yaml` header): the sim opens a `cg/contracts/` PR with the run ID and deltas; tools never edit `params.yaml`.

- **Adopted (#62): `matching.fillToMax: true`, `reunionBoost: 1.0`, `crowdBoost: 0.5`.** From the fillToMax × reunion × crowd grid on fake tables. Selected on seeds 0-9 (selection: 56.2% isolated vs 60.4% at the old params); held out on seeds 10-59 at the center: 55.6% isolated, CG − greedy +3.9 pts [+2.7, +5.1]; confirmed in all 25 cells on seeds 10-59: isolation −1.6 to −5.6 pts vs the old params, fill −1.9 to −2.3 pts, adopt = yes. Still worse than greedy in 24 of 25 cells (1 unclear). The truth world (`--world truth`, run `20261113T032906Z`) agrees at the center (−4.3 pts vs the old params, per #62). Mostly mechanical: fuller groups and more repeat pairs. This was exploratory (fake Laya); there is no real-Laya grid or confirm yet.
- **`isolationBoost` 0.5** stays: it only reorders contested exposure slots and seats, and the caps/boost grid found nothing that passed.
- **Learning loop: no robust gain** (run `20261113T012543Z_pool_sf_city_tune`, fake Laya). Held out on seeds 20-39: reward source `all` (α 0.9, boost 1) confirmed only show-up rate (+0.3% [+0.2, +0.5]); `meet_again` (α 0.3, boost 1) confirmed nothing. The real-Laya run agrees (all unclear). `prefAlpha` 0.3 / `prefBoost` 0.3 stay as starting values.

## Caveats

- The live backend does not use the Laya tables in ranking or grouping (it passes empty `LayaTables()`, so every p is 0.5); the sim does. Sim results describe the policy with real tables, not exactly what the demo backend computes. See [laya.md](laya.md#how-the-backend-loads-tables-and-a-known-gap).
- `cg-sim run --pool pool_evt_closer_together` without `--fake-laya` reads the fake `laya_gt` tables but records `"fakeLaya": false`, so its report would present hash results as evidence. Only `grid` checks the manifest. Treat any event-pool run as exploratory.
- The real-Laya result is one cell (center) and 20 seeds; robustness across the 25 cells has not been re-run on real tables.
- All results are relative comparisons on a synthetic pool, not predictions about real users.

## Dashboard (`services/dashboard`)

`cd services/dashboard && uv run cg-dashboard` (or `make dashboard`) on `127.0.0.1:9100` (`CG_DASHBOARD_HOST`, `CG_DASHBOARD_PORT`; loopback only). One page with tabs `/`, `/map`, `/replay`, `/muse`, `/controls`. It proxies `/api/i/<path>` to `CG_INTERNAL_URL/internal/v1/<path>`; `/api/replay` serves the newest `data/sim/runs/*/replay.json` by mtime (else a bundled fixture); `/api/local` serves demo.json, the low-outgoing IDs from `data/sim_private`, and the LAN IP. maplibre and qrcode are vendored (no CDN on stage). Demo controls are the internal API ops in `services/api/src/cg_api/internal/demo.py`.

## Tests

`cd services/sim && uv run pytest -q`: `tests/laya` (render goldens, precompute, real answer fields), `tests/mc` (engine, grid on a toy pool), `tests/seed` (adapter, scaffold, seed check).
