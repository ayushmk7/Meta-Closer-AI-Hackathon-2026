# Matching and ML (`packages/matching`, `cg_matching`)

One implementation of vectors, scenes, proposals, ranking and grouping. The backend runs it live (`ports.matching()`); the sim imports it (`services/sim/src/cg_sim/matching_adapter.py`). All functions are pure: no I/O, no clock, randomness only from `rng`/`seed`. Signatures are frozen: CONTRACTS §10. Code: `packages/matching/src/cg_matching/core.py`. Values below are `contracts/params.yaml` (v2) as of this branch.

## Pipeline

| Function | What it does |
| --- | --- |
| `build_vectors` | Per user, interest weights up the taxonomy tree (parent weight = `parentWeightFactor` 0.5 × child); `idf: true` reweights rare interests up. Hidden interests never count; sensitive only if opted in (P1, P4) |
| `candidates` | Cosine between vectors after hard filters (age bands `18_21/22_25/26_29`, trust floor, blocks either way). Top `knnK` 20 with cosine ≥ `minCosine` 0.15 |
| `scenes` | Leiden communities on the kNN graph (edge = cosine, `leidenResolution` 1.0), deterministic per seed (`rngSeedDefault` 7). Scene ID `sc_` + the community's top two shared level-2 interests |
| `propose_plans` | Per scene: top activity types × nearest open public non-sensitive venues × the window most members are free; up to `proposalsPerSceneWeek` 6; plus one `origin=signal` plan per strong visible frequent-place/routine signal |
| `rank_plans` | Per user feed, best first, ≤ `feed.size` 8 (below) |
| `form_groups` | Seats then max-min-pairwise split (below) |
| `update_prefs` | Learning-loop update (below) |
| `shared_interests`, `plan_overlap` | The overlap the backend reveals; apply P1/P2/P4 |
| `travel_minutes` | straight-line km × `detourFactor` 1.3 at mode speed + overhead |

## `rank_plans`

Three passes (docstring in `core.py`):

1. **Hard filters and base score** per (user, plan): skip if venue sensitive/unknown, already joined, not invited, group-size mismatch, busy-block conflict (or availability slot mismatch), travel over the user's max, or fit ≤ 0. `base = p_join × p_show × fit × travel_penalty × signal × isolation × reunion × crowd × pref`. `p_join`/`p_show` come from the Laya tables ([laya.md](laya.md)).
2. **Fill likelihood** per plan: (joined + Σ p_join of the top `exposureCapPerDay` scorers) / `size.min`. Plans below `fillLikelihoodFloor` 0.15 drop for everyone.
3. **Global greedy allocation** by score (ties: isolated first, then rng) under fairness caps.

### Fairness and caps

| Param | Value | Effect |
| --- | --- | --- |
| `plans.exposureCapPerDay` | 40 | a plan appears in ≤ 40 carousels/day, spreading demand |
| `feed.maxPerActivityType` | 2 | carousel diversity |
| `feed.maxPerScene` | 2 | ≤ 2 plans from the same scene |
| `feed.size` | 8 | cards per feed |
| `matching.isolationBoost` | 0.5 | × (1 + 0.5) for users with zero met connections; since it scales all of that user's scores it only changes who wins contested exposure slots and seats, not the order of their own feed |

### Boosts (values and what they do)

| Param | Value | Effect |
| --- | --- | --- |
| `signalBoost` | 0.4 | × 1.4 when a visible signal matches the plan's venue or interests |
| `reunionBoost` | 1.0 | × (1 + 1.0) on plans a met person already joined; `form_groups` also seats met pairs together |
| `crowdBoost` | 0.5 | × (1 + 0.5 × min(1, joins / `size.min`)) on already-filling plans |
| `fillToMax` | `true` | `form_groups` fills toward `size.max` (fewest, fullest groups) instead of stopping at `size.min` |
| `prefBoost` | 0.3 | × (1 + 0.3 × mean(prefs over the plan's matching keys)) |
| `prefAlpha` | 0.3 | EMA rate in `update_prefs` |

`reunionBoost`, `crowdBoost`, `fillToMax` were adopted from sim run `20261113T011854Z_pool_sf_city_grid` (#62), see [sim.md](sim.md).

## `form_groups`

Seats = min(eligible, venue capacity). Priority: isolated first, then most often left unseated (`seat_history`), then earliest join. Groups: `groups.sizeMax` 8 cap (plan cap, member `groupSize.max` respected), `strangerSizeMin` 3 (`metSizeMin` 2 if all have met), groups of 3+ need each member to share ≥ `minSharedWithOthers` 1 level-2 interest with ≥ `minOthers` 2 others (violator swapped for the best waiter or dropped). Objective `max_min_pairwise`: pair score = max candidate cosine × `p_meet_again`. Backfill path keeps `fixed_ids` and fills seats.

## Preference feedback loop

- Keys: `act:<activityType>`, `vn:<venueId>`, `int:<level-2 interest>` (`plan_pref_keys`; sensitive venues get no `vn:` key).
- `update_prefs(prefs, keys, r, alpha)`: `w = (1 − alpha) × w + alpha × r`, clamped to [−1, 1]; non-finite `r`/`alpha` change nothing. Returns a new dict.
- `rank_plans` reads `MatchState.prefs`; `PlanScore.debug["pref_keys"]` lists the keys that applied (owner-only "because you liked X").
- Backend side: `services/api/src/cg_api/domain/prefs.py` `reward(w, user, keys, r)` applies `update_prefs` with `prefAlpha` (feedback and likes call it) and `liked_label` renders "Because you liked X" from the strongest positive `int:`/`vn:` key. **TODO:** the mapping from stars/likes to `r` was not read for this doc.
- Evidence: the sim found no robust gain from the loop (see [sim.md](sim.md)); the code path ships, values `prefBoost`/`prefAlpha` are starting values.

## Tests

`cd packages/matching && uv run pytest -q` (`tests/test_match.py`, `test_m2.py`, `test_prefs.py`, `test_types.py`).
