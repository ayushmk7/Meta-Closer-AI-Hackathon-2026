# cg-sim status

| Milestone | State | Notes |
| --- | --- | --- |
| Scaffold (shared files) | done | cli dispatch, contracts.py, matching_adapter.py fallback, deps locked |
| M0 seed v2 | done (fake-muse text) | both pools, all 7 files, Maya + connector records, avatars, demo.json |
| M1 laya | not started | slice S2 |
| M2 montecarlo/report | not started | slice S3 |

## Seed v2 (seed 7)
- City: 300 personas + u_maya, 80 venues, ~90 plans, ~5.5k connector records, 2.8 MB. Event: 80 personas, 25 venues, ~70 plans, 0.8 MB.
- Personas: 3 to 8 true leaves from scene archetypes; ~10% one sensitive; 30% private; groupSize min >= 3;
  travel 20 to 45 min; 1 to 4 connected providers (maps ~80%, calendar ~70%, strava for athletes, spotify for music).
- Connectors: frequent place (>= 3 visits / 30 d) for half the pool; `params.sim.sensitiveSignalShare` visit a
  sensitive place weekly; calendar busy blocks are the complement of availability for the next 14 days.
- Scenes: primary archetype (`sc_<archetype>`) until cg_matching.scenes (Leiden) is available.
- Plans: `matching_adapter.propose_plans` on the ground-truth export (`seed.generate.ground_truth_export`,
  schema-valid pool_export), filtered to venue type + opening hours + horizon; targets are level-2 only.
  Hero, nudge and one more featured plan are curated, then up to 2 proposals passing Maya's filters.
- Titles/descriptions: templates (`--fake-muse`), titles <= 60 chars.

## Assumptions in use (confirmed by orchestrator, pending contracts sign-off)
- Plan horizon anchor = start of 2026-11-13 local + `plans.minLeadHours` (12 h) -> plans start >= 2026-11-13 12:00 PT.
- Timezone America/Los_Angeles. Plan titles <= 60 chars (schema allows 80). Nudge plans use origin `signal`.

## Open NEEDS (all slices)
- S1: `packages/matching` (cg_matching) missing; adapter fallback in use; delete fallback when backend M0 lands (needs contracts-owner sign-off).
- S1: event-pool `connectors.jsonl` carries u_maya Bedwell Bayfront visits though u_maya is not an event persona; backend must accept cross-pool records (or tell sim to change).
- S1: contracts owner to confirm the 12 h anchor reading above.
- S2 (laya): none reported yet.
- S3 (mc): rank_plans/form_groups fallbacks delivered; none else reported yet.
- S4 (dashboard): none reported yet.

## Decisions (open for review)
- Timezone America/Los_Angeles. Plan horizon starts 2026-11-13 00:00 local (demo day) + 12 h minLead.
- City hero: Sat 2026-11-14 10:00 wheel-throwing at fictional Clay Hour Studio (Hayes Valley), $35 prepaid, size 3-5,
  pre-joined by the private counterpart + one more. Nudge: Sun 9:00 Lands End walk, free, origin `signal`.
- Event pool: no u_maya persona; Maya's event-pool connectors.jsonl has 3 hackathon-week Bedwell Bayfront Park
  visits (her frequent place there), so the event nudge plan is at Bedwell. Event hero: Sat 11:00 lunch walk, $14 prepaid.
- Maya's calendar: work Mon-Fri 9:00-17:30 (off Nov 11-13, hackathon), busy Mon/Tue/Thu evenings, Sat/Sun afternoons.

## For other agents
- `cg_matching` not available yet; `cg_sim.matching_adapter` falls back to naive dict-in/dict-out stand-ins:
  `propose_plans`, `travel_minutes`, `build_vectors`, `candidates`, `rank_plans`, `form_groups` (same argument
  order as CONTRACTS §10; pool = pool_export dict; results are PlanScore / FormResult-shaped dicts with snake_case keys).
  Fallback ceilings: O(n^2) candidates, greedy max-min groups, unlimited groups per plan, no minSharedWithOthers rule.
- `cg_sim.seed.generate.ground_truth_export(pool_id, personas, truth, records)` builds the `--use-ground-truth` export.
- `data/sim_private/<pool>/ground_truth.jsonl`: userId, role, scene, archetypes, interests, noise,
  frequentPlaces, routines, sensitivePlace. `latent.jsonl`: outgoingness, flakiness, lowOutgoing, existingFriends.
