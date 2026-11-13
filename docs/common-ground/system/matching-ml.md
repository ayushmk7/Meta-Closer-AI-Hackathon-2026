# Matching and ML (`packages/matching`, `cg_matching`)

One implementation of interest vectors, candidates, scenes, proposals, ranking, grouping and the preference loop. The backend runs it live (`ports.matching()`, adapter `services/api/src/cg_api/domain/matching.py`); the sim imports it through `services/sim/src/cg_sim/matching_adapter.py`, so the Monte Carlo tests the same code the app runs ([sim.md](sim.md)). Code: `packages/matching/src/cg_matching/core.py` (functions) and `types.py` (records). Signatures are frozen (CONTRACTS §10).

All functions are pure: no I/O (except `Params.default()` when `plan_overlap` is called without `params`), no clock, and randomness only from the `rng`/`seed` argument. Every number below is from `contracts/params.yaml` (`version: 2`) on `origin/main`.

"Plans" in this doc are what the app now calls **Meetups** (user-facing rename); the code keeps `plan`.

## Pipeline

| Function | Input → output | Who calls it |
| --- | --- | --- |
| `build_vectors(pool, params)` | users → `{uid: {interestId: weight}}` | backend (each rank/form call), sim |
| `candidates(pool, vectors, params)` | → `{uid: [(other, cosine)]}`, top `knnK` | backend `form_groups` path, sim, precompute (`meet_again` pairs) |
| `scenes(pool, cands, params, seed)` | → `{uid: sceneId}` | seed generator |
| `propose_plans(pool, venues, scene_of, params, rng, horizon_start)` | → `[Plan]` | seed generator, sim world |
| `rank_plans(pool, plans, vectors, venues, tables, state, params, rng)` | → `{uid: [PlanScore]}` best first, ≤ `feed.size` | backend feed, sim `common_ground` |
| `form_groups(plan, interested_ids, pool, cands, tables, state, params, rng)` | → `FormResult(groups, unseated_ids)` | backend formation/backfill, sim |
| `plan_pref_keys(plan, venue)`, `update_prefs(prefs, keys, r, alpha)` | preference keys and the EMA update | backend `domain/prefs.py`, sim learned policy |
| `shared_interests`, `plan_overlap` | the overlap the app reveals (P1/P2/P4) | backend |
| `travel_minutes(origin, dest, mode, params)` | integer minutes | everywhere |

### Inputs the backend passes

`domain/matching.py` builds a `PoolSnapshot` from its own export (opted-in users plus Maya; `trustFloorOk` is always `true`, `groupOnly` always `true`; `metIds`, `blockedIds`, `connectionIds` from live connections). `MatchState` carries only `blocked_pairs`, `venue_capacity` (each venue's `booking.capacityPerSlot`) and `prefs`; `exposures`, `open_joins`, `met_pairs`, `seat_history` and `fixed_ids` are left empty on the main rank and form paths. The rng is `random.Random(matching.rngSeedDefault)` = 7.

Two consequences worth knowing:

- **Laya tables are empty in the backend.** Both calls pass `cgm.LayaTables()`, so `p_join`, `p_show` and `p_meet_again` are the default 0.5 for everyone, even though real tables are committed and loaded. Details in [laya.md](laya.md#how-the-backend-loads-tables-and-a-known-gap). The sim uses real tables.
- **Exposure cap is per ranking, not per day.** With no `state.exposures`, each `rank_plans` call starts every plan at the full cap. The backend caches the whole-pool ranking until the world changes (`rank_version`, joins, plans, `pref_version`, or the date), so in practice one ranking serves a day unless something changes.

## `build_vectors`

For each user, every **usable** interest (shown, and not sensitive unless the user opted that category in: P1, P4) contributes to its own id and every ancestor: `v[ancestor] = max(v[ancestor], weight × parentWeightFactor^(depth difference))` with `parentWeightFactor` 0.5. So `music.live_music.jazz` at 0.8 gives jazz 0.8, `music.live_music` 0.4, `music` 0.2. With `idf: true`, each key is then multiplied by `log((1 + n) / (1 + df)) + 1` (n = users with vectors, df = users having the key), so rare shared interests count more and an interest everyone has still weighs 1.

## `candidates`

Pair affinity for grouping and for the `meet_again` table.

1. Users considered: those with a non-empty vector and `trustFloorOk` not false.
2. Hard filters per pair: not blocked either way; age band rule: same band, or both in `matching.ageBands` [`18_21`, `22_25`, `26_29`]. Bands outside that list (e.g. `30_34`) pair only within their own band.
3. Score: cosine of the two vectors, rounded to 6 dp. Keep ≥ `minCosine` 0.15.
4. Sort by (−cosine, other id) and keep the top `knnK` 20.

Every user in the pool gets a key (possibly an empty list). Cost is O(n²) dot products; each user's vector norm is computed once and passed into `_cos` (#158). The code notes a numpy sparse matmul if pools reach about 5k users.

## `scenes`

Leiden (`leidenalg.RBConfigurationVertexPartition`, `leidenResolution` 1.0, seeded) on the undirected kNN graph from `candidates`, edge weight = the larger cosine of the two directions. Singletons and users with no edge get no scene. Communities are named by size: `sc_` + the leaf names of the community's top two level-2 interests by summed weight (`sc_mixed` if none); repeated names get `_2`, `_3`.

## `propose_plans`

Per horizon (`plans.horizonDays` 7 days starting `plans.minLeadHours` 12 h after `horizon_start`), candidate start windows are 10:00, 14:00 and 18:00 local (America/Los_Angeles). Every plan lasts 2 h (`PLAN_HOURS`) and gets `plans.defaultSize` {min 3, max 6}.

- **Scene plans**: for each scene, activity types are scored by the scene's summed level-2 weights over `ACTIVITY_INTERESTS[type]` (the activity → interest map in `core.py`, 31 types). For each type with score > 0, the two non-sensitive venues offering it with the lowest mean transit minutes from members' homes become options. Each option takes the open window where the most members are free (busy blocks with `calendar.minFreeBufferMin` 30 min on each side, else availability slots; rng breaks ties), skipping windows already used by the scene and venue+time pairs already used. Up to `proposalsPerSceneWeek` 6 per scene. Targets = the type's interests the scene actually has. `origin = "seed"`.
- **Signal plans**: one per known non-sensitive venue that some user's shown, non-sensitive `frequent_place` or `routine` signal points at with `strength ≥ nudges.minSignalStrength` 0.6. Activity type = the venue's type best matching the signals' level-2 interests. `origin = "signal"`.

Plan ids carry the horizon date (`pl_<scene>_<YYYYMMDD>_<nn>`, `pl_sig_<venue>_<YYYYMMDD>`) so nightly runs never reuse one.

## `rank_plans`

Per user, best first, at most `feed.size` 8. Three passes.

### Pass 1: hard filters and base score per (user, plan)

Users with `trustFloorOk` false or an empty vector get an empty feed. A plan is skipped for a user if any of these holds:

- venue unknown or sensitive;
- the user already joined (seed joins, the export's live joins, `state.open_joins`);
- it is an invite plan and the user is not invited;
- group-size mismatch: `plan.size_max < user.groupSize.min` or `plan.size_min > user.groupSize.max`;
- calendar: with busy blocks, any overlap within `minFreeBufferMin` 30 min; without, the start's (day, part) is not an availability slot (morning before 12:00, afternoon before 17:00, evening after);
- travel: the fastest of the user's modes exceeds `travel.maxMinutes`;
- `fit ≤ 0`, where `fit` = cosine(user vector, plan target vector). The target vector puts 1.0 on each target interest and `0.5^k` on its ancestors.

Then:

```
base = p_join × p_show × fit × travel_pen
       × (1 + signalBoost)        if a visible signal matches the plan
       × (1 + isolationBoost)     if the user is isolated
       × (1 + reunionBoost)       if someone the user has met already joined
       × (1 + crowdBoost × min(1, joined / size.min))
       × (1 + prefBoost × mean(prefs over the plan's keys the user has))
```

- `p_join`, `p_show`: `tables.p_join/p_show(user, activityType)` (0.5 when missing).
- `travel_pen = 1 − 0.5 × minutes / maxMinutes`: 1.0 at the door, 0.5 at the user's limit.
- Signal match: a shown, non-sensitive signal at the plan's venue, or with an interest related (same, ancestor or descendant) to a plan target.
- **Isolated** = the user is in no met pair (`metIds` plus `state.met_pairs`).
- Reunion, crowd and prefs are absent-safe: a missing param means off, byte-identical output.

### Pass 2: fill likelihood per plan

Each user's top `feed.size` rows by base are "interested" in those plans. For each plan, take the top `exposureCapPerDay` (40) of those by base and compute `fill = min(1, (joined + Σ p_join) / size.min)`. Plans with `fill < plans.fillLikelihoodFloor` (0.15) are dropped for everyone.

### Pass 3: global greedy allocation

Every surviving (user, plan) row gets `score = base × fill`. All rows from all users are sorted together by (−score, isolated first, rng draw, user id) and dealt out in that order. A row is skipped when the plan has no exposures left (`exposureCapPerDay − state.exposures[plan]`), the user's feed is full (8), the user already has `maxPerActivityType` 2 of that type, or `maxPerScene` 2 from that scene. Because isolation multiplies all of a user's scores, it barely changes the order of their own feed; it decides who wins contested exposure slots.

Output `PlanScore(user_id, plan_id, score, shared_coarse, travel_minutes, debug)`: `shared_coarse` = up to `privacy.sharedCoarseMax` 3 level-2 targets the user has; `debug` has `fit`, `p_join`, `p_show`, `fill`, `isolated`, `signal_ids`, plus `pref_keys` (applied keys, strongest first) and `reunion: true` when they applied.

### Parameters

| Param | Value | Role |
| --- | --- | --- |
| `feed.size` | 8 | cards per feed |
| `feed.maxPerActivityType` | 2 | diversity cap |
| `feed.maxPerScene` | 2 | diversity cap |
| `plans.exposureCapPerDay` | 40 | per-plan exposure cap; also the top-K in pass 2 |
| `plans.fillLikelihoodFloor` | 0.15 | drop unlikely-to-fill plans |
| `matching.isolationBoost` | 0.5 | × 1.5 for isolated users |
| `matching.signalBoost` | 0.4 | × 1.4 on signal matches |
| `matching.reunionBoost` | 1.0 | × 2 when a met person joined; also seats met pairs together in `form_groups` |
| `matching.crowdBoost` | 0.5 | up to × 1.5 as a plan fills toward `size.min` |
| `matching.fillToMax` | `true` | `form_groups` fills toward the cap (below) |
| `matching.prefBoost` | 0.3 | learned-preference multiplier |
| `matching.prefAlpha` | 0.3 | EMA rate in `update_prefs` |
| `calendar.minFreeBufferMin` | 30 | free time either side of a plan |

`reunionBoost`, `crowdBoost` and `fillToMax` were set by sim run `20261113T011854Z_pool_sf_city_grid` (#62, fake Laya tables, confirmed on held-out seeds in all 25 cells against the old params). See [sim.md](sim.md#how-results-fed-params).

## `form_groups`

Seats and groups for one plan at formation (or a backfill).

1. **Eligible** = interested ids (deduplicated, join order) that are in the pool with `trustFloorOk` not false.
2. **Queue** sorted by: isolated first, then most times left unseated (`state.seat_history`), then join order. (`groups.seatPriority` in params documents `[isolated, earliest_join]`; the code does not read it, and the backend passes no seat history.)
3. **Seats** = min(eligible, `state.venue_capacity[venue]`).
4. **Pair score** `pair(a, b)` = max of the two directed candidate cosines (0 if neither lists the other) × `tables.p_meet_again(a, b)`; −1 if blocked. A group's quality is its minimum pair score (objective `max_min_pairwise`).
5. **Group sizes.** Cap `hi = min(plan.size_max, groups.sizeMax 8)`.
   - `fillToMax: true` (current): each group aims at `hi` (or the seats left). Once at least one group exists, a remainder smaller than `strangerSizeMin` 3 waits.
   - `fillToMax: false`: split size = min(`hi`, median of the seated users' own `groupSize.max`); k = ceil(seats / split), reduced while groups would fall under `strangerSizeMin`; sizes balanced.
6. **Filling a group.** Start with the head of the queue. Each next member must accept the new size (`groupSize.max ≥ n`, and all current members must too) and must not be blocked with anyone in the group. Among those, prefer people inside the priority window (the next free seats' worth of the queue); pick by (met people already in the group, if `reunionBoost > 0`; then the candidate's minimum pair score to the group; then queue position). Someone outside the window steps in only when nobody inside fits. If a member's own max closes a group short, the free seats roll to the next group.
7. **Shared-interest rule.** In groups of 3+, every member must share ≥ `minSharedWithOthers` 1 level-2 interest with ≥ `minOthers` 2 others. Violators are removed lowest priority first and replaced by the first waiting person who fits (not blocked, size ok, shares ok), else dropped to unseated.
8. **Minimum size.** A group below `max(plan.size_min, metSizeMin 2 if everyone in it has met else strangerSizeMin 3)` is dissolved into unseated.

Result: groups (members in join order, `min_pairwise` rounded to 6 dp) and `unseated_ids` (dropped, waiting, unknown or under the trust floor, in join order).

**Backfill** (`state.fixed_ids[plan]` non-empty): keep the fixed members together and add the best waiting people (same fit rules, shared-interest check from 3) up to `max(minimum size, fixed + 1)` capped at `hi`. If it still falls below the minimum, nobody is seated and the caller cancels or offers alternatives.

## Isolation, everywhere it acts

"Isolated" in the matching code means a user who has **met nobody** (no met pair). It acts in three places:

1. `rank_plans` pass 1: × (1 + `isolationBoost` 0.5) on every base score.
2. `rank_plans` pass 3: isolated users win ties and, through the boost, contested exposure slots.
3. `form_groups`: isolated users are seated first.

The sim's headline metric is different: `isolatedLowW8` counts low-outgoing people with no **friendship** (two mutually liked meetups) at week 8. With real Laya tables Common Ground seats 92.7% of low-outgoing people at least once vs greedy's 84.7%, but leaves more of them without a friendship at week 8 (37.2% vs 33.3%) ([sim.md](sim.md#real-laya-run-real_laya_center)).

## Preference feedback loop

- **Keys** (`plan_pref_keys`): `act:<activityType>`, `vn:<venueId>` (never for a sensitive venue, P4), `int:<level-2 target>` for each distinct target.
- **Update** (`update_prefs(prefs, keys, r, alpha)`): for each key, `w = (1 − alpha) × w + alpha × r`, with `r` and `alpha` clamped and the result clamped to [−1, 1], rounded to 6 dp. A non-finite `r` or `alpha` changes nothing. Returns a new dict.
- **Ranking**: `rank_plans` multiplies by `1 + prefBoost × mean(w)` over the plan's keys the user has weights for.
- **Backend rewards** (`services/api/src/cg_api/domain/prefs.py` `reward`, `alpha = prefAlpha` 0.3; each call bumps `pref_version`, which invalidates the rank cache):

| Event | Keys | r |
| --- | --- | --- |
| First feedback for a meetup, with a star rating 1-5 (`domain/verify.py`) | the plan's keys | `(rating − 3) / 2` (−1 to +1) |
| First feedback without a rating | the plan's keys | +0.5 if more than half of the people answered "meet again", else −0.5 |
| Feedback tag `too_far` (non-sensitive venue) | `vn:<venue>` | −0.5 |
| Like on a share, once per user and share (`domain/shares.py`) | the share's keys | +0.3 |

- **Copy**: `liked_label` shows "Because you liked X" from the plan's strongest positive `int:` or `vn:` key by weight, an interest winning a tie (`act:` keys are never shown). Owner-only (P7).
- **Sim stand-in**: +0.5 to people who showed and liked someone, −0.5 to the rest who showed, and −0.5 for a no-show with `learnFrom=all`.
- **Evidence**: no robust gain on held-out seeds, with fake or real tables, so `prefAlpha` / `prefBoost` stay at 0.3 / 0.3 and the app presents it as learning, not proven ([sim.md](sim.md#how-results-fed-params)).

## Other helpers

- `shared_interests(pool, a, b, level, limit)`: interests at `level` both users have (usable only: shown, sensitive only if opted in), strongest combined first.
- `plan_overlap(pool, user, plan, joined_ids, level, limit, params=)`: (interest, count of other joiners with it) for the viewer's interests; empty below `privacy.crowdMinCount` 2 other joiners (P2).
- `travel_minutes`: haversine km × `detourFactor` 1.3 / `speedsKmh` {walk 4.8, bike 15, transit 16, drive 28} × 60 + `overheadMin` {walk 0, bike 3, transit 8, drive 6}, rounded up.

## Performance

Measured on seed pools cloned to larger sizes, outputs compared with `==` before and after (details and the full table in [perf-and-bugs.md](perf-and-bugs.md), rows MA-1 and MA-2):

| Change | What | 400 users | 600 users |
| --- | --- | --- | --- |
| #156 `form_groups` seat loop | Each waiting person's minimum pair score to the growing group is kept in a dict (`low`) and updated with the newest member only, instead of recomputing it over the whole group for every candidate at every seat (twice). Queue positions come from a dict instead of `list.index`. The isolated set in `form_groups` and `rank_plans` is a set difference. The loop was O(n² × group size) with 565k `pair()` calls at 600 users; it is still O(n²) by design (greedy over the waiting list). | 222 → 63 ms | 579 → 141 ms |
| #158 `candidates` norms | Each user's vector norm is computed once and passed into `_cos(na, nb)`; `_cos` without them is unchanged. | 188 → 102 ms (PR) / 189 → 101 ms (perf-and-bugs) | 428 → 231 ms (PR) / 434 → 241 ms (perf-and-bugs) |

Numbers are `pool_sf_city` clones. The two sets of #158 numbers come from separate benchmark runs: the PR body's run and the adversarial track's measurement recorded in perf-and-bugs.md; both show about 1.8× at 600 users. Outputs were identical in both changes (8 pool/size combos for #156, including fillToMax and reunion off and a venue capacity cap). The remaining `candidates` cost is the O(n²) dot products. The backend runs `build_vectors` + `candidates` + `form_groups` on every formation.

## Tests

`cd packages/matching && uv run pytest -q` (31 tests: `tests/test_match.py`, `test_m2.py`, `test_prefs.py`, `test_types.py`, golden ranking `tests/golden_rank.json`). Current status of the demo stack: [status.md](status.md).
