# cg-sim status

| Milestone | State | Notes |
| --- | --- | --- |
| Scaffold (shared files) | done | cli dispatch, contracts.py, matching_adapter.py shim over cg_matching, deps locked |
| M0 seed v2 | done (fake-muse text) | both pools, all 7 files, Maya + connector records, avatars, demo.json |
| M1 laya | not started | slice S2 |
| M2 montecarlo/report | not started | slice S3 |

## Seed v2 (seed 7)
- City: 300 personas + u_maya, 80 venues, ~90 plans, ~5.5k connector records, 2.8 MB. Event: 80 personas, 25 venues, ~70 plans, 0.8 MB.
- Personas: 3 to 8 true leaves from scene archetypes; ~10% one sensitive; 30% private; groupSize min >= 3;
  travel 20 to 45 min; 1 to 4 connected providers (maps ~80%, calendar ~70%, strava for athletes, spotify for music).
- Connectors: frequent place (>= 3 visits / 30 d) for half the pool; `params.sim.sensitiveSignalShare` visit a
  sensitive place weekly; calendar busy blocks are the complement of availability for the next 14 days.
- Scenes: cg_matching Leiden scenes on the ground-truth export (sim_private keeps the generating archetype as `scene`).
- Plans: `matching_adapter.propose_plans` on the ground-truth export (`seed.generate.ground_truth_export`,
  schema-valid pool_export), filtered to venue type + opening hours + horizon; targets are level-2 only.
  Hero, nudge and one more featured plan are curated, then up to 2 proposals passing Maya's filters.
- Titles/descriptions: templates (`--fake-muse`), titles <= 60 chars.

## Resolved by CONTRACTS.md "Decisions" (2026-11-12)
- Timezone America/Los_Angeles; plan startsAt >= 2026-11-13T12:00:00-08:00; titles <= 60; nudge origin `signal`.
- Event-pool nudge: any free plan in the window (frequent-place rule is city only); event pool carries no u_maya records.
- Hand-built hero / nudge / third featured plans allowed. Matching fallback deleted (packages/matching merged, #13).

## Open NEEDS (all slices)
- S1: MatchState fields confirmed by cg_matching 0.2.0 (exposures, open_joins, met_pairs, blocked_pairs, seat_history, venue_capacity, fixed_ids).
- S2 (laya): ground-truth signals API delivered. Laya answer fields unverified (Decisions: one LayaClient adapter, fail loudly).
- S3 (mc): adapter requests delivered. Note: isolationBoost only bites if MC passes live metPairs into rank_plans.
- S4 (dashboard): none reported yet.

## Seed decisions
- Timezone America/Los_Angeles. Plan horizon starts 2026-11-13 00:00 local (demo day) + 12 h minLead.
- City hero: Sat 2026-11-14 10:00 wheel-throwing at fictional Clay Hour Studio (Hayes Valley), $35 prepaid, size 3-5,
  pre-joined by the private counterpart + one more. Nudge (b5): Sun 2026-11-15 19:00-20:30 `pl_sf_little_fern_table` at fictional Little Fern
  Kitchen (`vn_little_fern`, 418 Hayes St, kind `restaurant`, reservation, $32 pay at venue, no approval), size 4-4,
  3 pre-joined, origin `signal`; Maya's frequent place (4 Friday dinners). Check: nudge free or pay at venue.
- Venue photos (b5): `venue_photos/vn_little_fern.jpg`, `vn_clay_hour.jpg` copied from clone images (`venues.PHOTOS`),
  listed in `venue_photos/PROVENANCE.md`; other venues have no photo.
- Event pool: no u_maya persona or records. Event nudge: free Sun 9:00 Bedwell Bayfront walk. Event hero: Sat 11:00 lunch walk, $14 prepaid.
- Maya's calendar: work Mon-Fri 9:00-17:30 (off Nov 11-13, hackathon), busy Mon/Tue/Thu evenings, Sat/Sun afternoons.

## For other agents
- `cg_sim.matching_adapter` is a thin dict-in/dict-out shim over cg_matching 0.2.0 (path dep on packages/matching);
  no fallback. Same functions as before (+ `scenes`), `HAVE_MATCHING` is always True. The caller's params dict is
  passed through as `cg_matching.Params` (sweep overrides apply). state: MatchState or dict (camelCase/snake_case);
  tables: LayaTables, path to data/laya_tables/<pool>/, duck-typed fake, or None (cg_matching defaults, 0.5).
- `cg_sim.seed.export.load_ground_truth_export(pool_id)` / `ground_truth_signals(pool_id)`: read-only `--use-ground-truth` API (README).
- `data/sim_private/<pool>/ground_truth.jsonl`: userId, role, scene, archetypes, interests, noise,
  frequentPlaces, routines, sensitivePlace. `latent.jsonl`: outgoingness, flakiness, lowOutgoing, existingFriends.
