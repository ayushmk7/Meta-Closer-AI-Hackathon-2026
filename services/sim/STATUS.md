# sim status
Milestone: M0 (done, PR open) → M1 next

## Done
- 2026-11-12 Seed v0 for `pool_sf_city` (300 + Maya) and `pool_evt_closer_together` (80): schema-valid, deterministic (`cg-sim seed`, seed 7), `demo.json` for both pools, Maya from the clone seed. `cg-sim seed --check` and `pytest` pass.

## Decisions
- 2026-11-12 Seed text (bios, activity, onboarding) is templated in v0 (`--fake-muse` path); Muse-written text replaces it later behind the same functions, cached in `services/sim/.cache/`. Why: unblocks the backend now; the template noise model (passing mentions, Group/Event-only interests, indirect sensitive interests) already makes extraction non-trivial.
- 2026-11-12 IDs: city `u_0001`..`u_0300`, event `u_e001`..`u_e080` (no collisions when the backend loads both pools). Activity IDs `act_<suffix>_<n>`.
- 2026-11-12 Interests come from 20 scene archetypes (climbers, tabletop, makers, growers, builders...); 1 or 2 per person, 3 to 8 leaves, ~10% with one sensitive leaf, ~30% of people also get one random leaf.
- 2026-11-12 Hidden traits: exactly `round(n * lowOutgoingShare)` people are low-outgoing (outgoingness 0.03 to 0.33, 0 to 2 existing friends); flakiness Beta(2, 5). ~30% private profiles, ~15% without avatar.
- 2026-11-12 Featured identities are planted: 4 per pool, sharing specific Maya interests, availability overlapping hers (sat morning, sun afternoon, wed evening), age bands in `matching.ageBands`, low flakiness, vivid activity. City featured live in Outer Sunset, Cole Valley, Inner Richmond, Inner Sunset. `featuredIds` order: public (live user), public, private, public.
- 2026-11-12 Maya lives in Inner Sunset (the clone's book swap is at the Sunset Community Room). Her activity is her 6 posts and 4 comments copied verbatim from `seed.ts`, membership in the 3 clone Groups and RSVPs to the 4 clone Events. No onboarding transcript for Maya: her onboarding is live in the demo.
- 2026-11-12 Event pool has no `u_maya` persona (she opts in from the city pool); its `demo.json` hard filters are checked with Maya standing at `fakeLocation`, which is next to the venue.
- 2026-11-12 Avatars: generated 96x96 abstract silhouettes (stdlib PNG writer, deterministic bytes); Maya's is the clone's `maya.jpg`, cited in `avatars/PROVENANCE.md`.
- 2026-11-12 `sim_private/<poolId>/ground_truth.jsonl`: `{userId, role, archetypes, interests[{id, weight, sensitive}], noise[]}`; `latent.jsonl`: `{userId, outgoingness, flakiness, lowOutgoing, existingFriends}`.
- 2026-11-12 No `cg_matching` dependency yet: `packages/matching` does not exist on main. Added as a path dependency in M1 once the backend's M0 lands.

## Needs
- (none)

## Known gaps
- Seed text is templated, not Muse-written yet.
- `cg-sim eval | precompute | run | report` and `cg-dashboard` not built (M1, M2).
