# Simulation (`services/sim`, `services/dashboard`)

`cg-sim` (`services/sim/src/cg_sim`) generates the seed, precomputes Laya tables ([laya.md](laya.md)), and runs the Monte Carlo that tests the matching policy. It imports `cg_matching` through `matching_adapter.py`, so the sim and the product run the same code and the same `contracts/params.yaml`. `STATUS.md` in the folder is stale (milestones M1/M2 listed "not started" though code exists); trust the code.

## Commands (`cli.py` dispatches `cg-sim <cmd>` to `cg_sim.<module>.main`)

| Command | Does |
| --- | --- |
| `cg-sim seed [--pool ID] [--seed N] [--check]` | regenerate `data/seed/*` and `data/sim_private/*`, or validate them. Pools: 300 city personas + `u_maya`, 80 venues; event pool 80 personas (params `sim.*`) |
| `cg-sim eval [--pool] [--use-ground-truth]` | extraction and sensitive-gate eval vs ground truth |
| `cg-sim precompute [--pool] [--fake-laya] [--use-ground-truth] [--no-reload]` | Laya tables |
| `cg-sim run [--pool] [--fake-laya] [--seeds N] [--cells all\|center] [--weeks N] [--world tables\|truth] [--policies ...] [--no-ablate]` | Monte Carlo → `data/sim/runs/<runId>/{config.json, results.jsonl, replay.json}` |
| `cg-sim report [--run-id]` | `REPORT.md` + `isolated_share.png` |
| `uv run python -m cg_sim.mc.grid` / `.tune` | params grid, learning-loop tune (exploratory; never edits `params.yaml`) |

`make sim-seed|sim-precompute|sim-run` wrap these with `POOL=pool_sf_city`.

## Model

`mc/engine.py`: daily tick: carousels → joins → formation at `formsAt` → meetups at `startsAt` → state. Policies: `random`, `greedy`, `common_ground` (the real `rank_plans` + `form_groups`), and `common_ground_learned` (adds `MatchState.prefs` via `update_prefs`). Common random numbers: draws keyed by (seed, day, purpose), so all policies see identical randomness. Calibration knob `JOIN_DAILY = 0.5` (not a contract param). Sweep cells: `sim.sweepMultipliers` [0.5, 0.75, 1, 1.25, 1.5] applied to flake rate × join rate = 25 cells; 1.0 × 1.0 is the center/replay cell. Defaults: `weeks` 8, `seeds` 50.

Metrics (`engine.simulate`): `isolatedLowW8` (low-outgoing people still with zero met connections at week 8, the headline), `friendShareW4/W8`, `fillRate`, `showRate`, `joinToMeetup`, `giniFriends`, `medianDaysFirstMeetup`, repeat-pair shares (`repeatCoattendShare`, `repeatLikedShare`), `meanGroupSize`, `lowSeatedShare`, plus by-week series.

## Held-out method

Never report the number you selected on (winner's curse). `mc/grid.py`: (1) select on seeds 0..N-1 at the center cell; (2) re-run the top combos on fresh seeds (e.g. 10-59) → `holdout.jsonl`; (3) `--confirm`: best held-out combo vs current vs greedy in all 25 cells. All diffs are seed-paired 95% CIs. Adoption bar: isolation better than current in every cell, fill vs current ≥ −3 pts. `mc/tune.py` does the same for the learning loop (select seeds 0-19, report 20-39; a metric counts only if it clears 0 on both).

## How results feed params

Process: sim opens a `cg/contracts/` PR with run ID and deltas (`params.yaml` header). Applied so far (CONTRACTS Decisions, "Isolation params adopted"):

- `matching.fillToMax: true`, `reunionBoost: 1.0`, `crowdBoost: 0.5` from run `20261113T011854Z_pool_sf_city_grid` (#62): selected on seeds 0-9, confirmed on held-out seeds 10-59 in all 25 cells; low-outgoing isolation improves 1.6-5.6 pts vs the previous params, fill −1.9 to −2.3 pts. Still worse than `greedy` in 24/25 cells (1 unclear). Largely mechanical (fuller groups, more repeat pairs).
- `isolationBoost` (0.5) only reorders contested exposure slots and seats; the b2 grid found no cap/floor/boost change that passed.
- **Learning loop: no robust gain.** Run `20261113T012543Z_pool_sf_city_tune` (`REPORT.md`): held-out, reward source `all` (α 0.9, boost 1) confirmed only show-up rate (+0.3%); `meet_again` (α 0.3, boost 1) confirmed nothing; friendship share, low-outgoing isolated and fill showed no confirmed gain. So `prefBoost` 0.3 / `prefAlpha` 0.3 stay as starting values. (Not recorded in the CONTRACTS Decisions on this branch; the REPORT is the source.)

## Caveat: fake-Laya results

All runs in `data/sim/runs/` use **fake (hash) Laya tables**; the committed `data/sim/laya_gt/*/manifest.json` say `"layaModel": "fake"`. Reports label themselves "Exploratory, fake Laya: not evidence". Treat results as relative and suggestive until real tables replace them (HUMAN_TODO §2.4), then rerun precompute and the confirm grid.

## Dashboard (`services/dashboard`)

`cd services/dashboard && uv run cg-dashboard` (or `make dashboard`), `127.0.0.1:9100` (`CG_DASHBOARD_HOST/PORT`, loopback only). Single page, tabs `/`, `/map`, `/replay`, `/muse`, `/controls`. Proxies `/api/i/<path>` to `CG_INTERNAL_URL/internal/v1/<path>`; `/api/replay` serves the newest `data/sim/runs/*/replay.json` (else a bundled fixture); `/api/local` serves demo.json, low-outgoing IDs from `data/sim_private`, and the LAN IP. Vendored maplibre + qrcode (no CDN at stage time). Demo controls (advance meetup to `leave_by`/`window_open`/`completed`, reset, demo state) are the internal API ops in `services/api/src/cg_api/internal/demo.py`.
