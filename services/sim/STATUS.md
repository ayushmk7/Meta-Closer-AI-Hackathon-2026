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
- S1 needs: contracts-owner sign-off that demo.json hero, nudge and the third featured plan are curated by hand
  (`seed/plans.py`), not output by propose_plans (PRD-3 §3 / AGENT_RULES R6). The rest of the inventory comes from propose_plans.
- S1 needs: backend to confirm `cg_matching.MatchState` keyword fields (adapter assumes snake_case of exposures,
  openJoins, metPairs, blockedPairs, seatHistory) when packages/matching lands.
- S2 (laya): ground-truth signals API -> delivered (`cg_sim.seed.export`, see README).
- S3 (mc): rank_plans/form_groups fallbacks delivered; fill likelihood, unbiased exposure order, scene cap, isolated-first, minSharedWithOthers -> delivered.
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
  Fallback honours: feed.size/maxPerActivityType/maxPerScene, plans.exposureCapPerDay/fillLikelihoodFloor,
  calendar.minFreeBufferMin, travel.*, matching.isolationBoost/signalBoost/parentWeightFactor/knnK/minCosine,
  groups.minSharedWithOthers/minOthers/seatPriority, trust.floor (trustFloorOk), blocked pairs, P4 (sensitive skipped).
  Fallback ceilings (interim MC numbers understate/misstate common_ground until cg_matching lands):
  matching.idf, matching.ageBands, matching.leidenResolution (scenes = archetypes), plans.openJoinsMax,
  groups.sizeMax, groups.objective (greedy approximation of max_min_pairwise), venue capacity (unlimited groups
  per plan), O(n^2) candidates, fill likelihood = seed joins + mean p_join x min(eligible, exposure cap).
  Real-cg_matching branch: dict state -> MatchState(**snake_case keys), str/Path tables -> LayaTables.from_dir.
- `cg_sim.seed.export.load_ground_truth_export(pool_id)` / `ground_truth_signals(pool_id)`: read-only `--use-ground-truth` API (README).
- `data/sim_private/<pool>/ground_truth.jsonl`: userId, role, scene, archetypes, interests, noise,
  frequentPlaces, routines, sensitivePlace. `latent.jsonl`: outgoingness, flakiness, lowOutgoing, existingFriends.
