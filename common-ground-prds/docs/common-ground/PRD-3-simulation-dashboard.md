# PRD 3: Seed data, Laya simulation and the backend-only dashboard

**Agent:** sim · **Branch prefix:** `cg/sim/` · **Status file:** `services/sim/STATUS.md`
**Writes only:** `services/sim/**`, `services/dashboard/**`, `data/**`

Read first: [CONTRACTS](../../contracts/CONTRACTS.md), [AGENT_RULES](AGENT_RULES.md), `contracts/schemas/`, `contracts/laya_questions.yaml`, `contracts/laya_golden.json`, `contracts/params.yaml`, `contracts/modes.yaml`, `contracts/openapi.internal.yaml`. [DESIGN](DESIGN.md) explains the product.

## 1. Goal

Three things, all reproducible from a seed:

1. **Seed data** for two pools that the backend loads as if they were real Facebook users: San Francisco (city, 300 people) and the Closer Together AI Hackathon (event, 80 people), plus Maya and the demo identities.
2. **The Laya simulation**: precompute Laya probability tables, then run Monte Carlo weeks to show that the Common Ground policy connects more isolated people than greedy matching does, across a robustness sweep. Relative claims only.
3. **The dashboard**: Muse's internal map of the whole pool, the simulation replay, and the demo controls, on the laptop only.

## 2. Fixed

- Python 3.12. `services/sim` and `services/dashboard` each have their own `pyproject.toml` and lockfile and depend on `packages/matching` by path (read-only). The Common Ground policy in the simulation is `cg_matching.build_drops` and `form_group`, never a re-implementation.
- Output formats from `contracts/schemas/` and `laya_questions.yaml#tables`. Laya states rendered with the shared templates, reproducing `laya_golden.json` byte for byte.
- Talk to the backend only through `CG_INTERNAL_URL`. Never touch its database.
- Hidden traits and ground truth stay in `data/sim_private/`. Nothing derived from them goes into `data/seed/` or `data/laya_tables/`.
- Fictional people only. No real names of private people, no photos of real people. Avatars are generated (illustrated or abstract) or properly licensed, listed in `avatars/PROVENANCE.md`.
- The dashboard binds to `CG_DASHBOARD_HOST:CG_DASHBOARD_PORT` (`127.0.0.1:9100`), has no route the app can reach, and is never linked from the app.

## 3. Seed generation: `cg-sim seed`

`cg-sim seed --pool pool_sf_city --seed 7` writes `data/seed/pool_sf_city/` and `data/sim_private/pool_sf_city/`. Same seed, same bytes. `cg-sim seed --check` validates everything against the schemas.

**Personas.** For each person, sample in code (deterministic), then let Muse write the human text:

| Field | Rule (starting values; record your choices in STATUS.md) |
| --- | --- |
| Ground-truth interests | 3 to 8 taxonomy leaves, clustered so real scenes exist (bouldering + trail running, board games + D&D, ceramics + printmaking...). About 10% of people have one sensitive interest. |
| Hidden traits | Outgoingness and flakiness in [0, 1]; `params.sim.lowOutgoingShare` of people are low-outgoing with few existing friends: the target user |
| Home and neighborhood | Real San Francisco neighborhood names, points inside each, weighted toward residential areas; event pool clustered around the Menlo Park venue in `modes.yaml` |
| Profile | About 30% private; age bands 18 to 29 mostly; availability 3 to 8 slots; group size preference |
| Names | Fictional, diverse, not colliding with the clone's seed people (Amina Rahman, Leo Ortiz, Priya Nair, Jordan Ellis, Elena Brooks, Theo Morgan, and the rest in `facebook-clone/src/data/seed.ts`) |

**Activity** (`activity.jsonl`): 2 to 4 weeks of synthetic Facebook activity per person written by Muse from the ground truth, with realistic noise: passing mentions that are not real interests, interests that only show up in Group memberships or Event RSVPs, sensitive interests that appear only indirectly. This noise is what makes the extraction eval meaningful.

**Onboarding transcripts** (`onboarding.jsonl`): a short simulated chat per person, consistent with the ground truth and the persona's outgoingness.

**Maya** (`u_maya`, `cloneProfileId: "maya"`): built from the clone's seed. Her activity is her posts, comments, Groups and Events in `facebook-clone/src/data/seed.ts` (read-only), translated to the activity schema; her avatar is the clone's `assets/images/maya.jpg` (copy it and cite `facebook-clone/assets/provenance.md`). Her ground truth reflects those posts (coast hikes, gardening, pottery and so on). Maya is in the city pool; the backend lets her opt into the event pool too.

**Demo identities** (`demo.json`, both pools): 3 to 5 featured people for Maya's first drop who pass all hard filters with her, including one public profile sharing at least two of her top interests (`publicFeaturedId`, also the `liveUserId` for the second phone) and one private profile sharing at least one (`privateFeaturedId`). `counterpartIds` includes every featured ID. `fakeLocation` is a point in Maya's neighborhood.

Commit the seed and avatars (keep the city pool under about 5 MB). Cache Muse outputs under `services/sim/.cache/` (gitignored) so reruns are free and identical.

## 4. Extraction eval: `cg-sim eval`

After the backend loads the seed (`POST /internal/v1/seed/load`, then poll the job), pull `GET /internal/v1/pools/{poolId}/export` and compare against ground truth: precision and recall at leaf level and at level 2, and the sensitive gate's recall (the number that matters) and precision. Write `data/sim/runs/<runId>/extraction.json` and a short table for the report. Until the backend serves the export, `--use-ground-truth` builds the same export shape from ground truth so everything downstream works.

## 5. Laya precompute: `cg-sim precompute`

From the export: vectors and candidates via `cg_matching`, then the three tables in `laya_questions.yaml#tables`:

- `connect`: both directions for each person's top `params.sim.candidatesPerUser` candidates, with the card a drop would show (coarse shared interests via `cg_matching.shared_interests`, distance band, a templated reason; Muse reasons are not needed here).
- `activity`: every person × every activity type, `accept_activity` and `show_up`.
- `meet_again`: every candidate pair.

About 36,000 Laya answers for the city pool; batch them. Write `manifest.json` with `questionsVersion`, model and row counts, then call `POST /internal/v1/laya-tables/reload`. `--fake-laya` uses the same deterministic hash rule as the backend's `LAYA_FAKE`.

## 6. Monte Carlo: `cg-sim run`

numpy, no model calls inside the loop. 8 weeks of daily ticks (`params.sim.weeks`). Each day:

1. The policy builds drops: **random**, **greedy** (top cosine, no exposure cap, no isolation boost, no diversity) or **common_ground** (`cg_matching.build_drops`, plus `form_group` for multi-select behaviour you model).
2. Draws decide connects (`p_connect` × the connect multiplier), mutual connects, meetup proposals (your rule, documented), acceptance (`p_accept`), show-ups (`p_show` scaled by the flake multiplier), and meet-again (`p_meet_again`).
3. State updates: exposures, connections, confirmed meetups. Friendship = `params.sim.friendshipMeetups` meetups where both wanted to meet again.

**Metrics** per policy, seed and sweep cell: share of people with at least one friendship at weeks 4 and 8; share still isolated among the low-outgoing third (join with `sim_private`); mutual-connect rate; show-up rate; Gini of friend counts; median days to first meetup.

**Robustness:** `params.sim.seeds` seeds per policy; sweep flake and connect multipliers over `params.sim.sweepMultipliers` (a 5 × 5 grid). A claim goes in the report only if it holds in every cell, with 95% intervals over seeds.

Stretch, reported separately: a "truth" world model where outcomes come from hidden traits while the policy only sees Laya tables. It tests whether the policy still wins when its beliefs are imperfect.

## 7. Report: `cg-sim report`

`data/sim/runs/<runId>/REPORT.md` with: extraction eval, the headline relative result ("Common Ground leaves X% of low-outgoing people isolated at week 8 versus Y% for greedy, in all 25 sweep cells"), the isolated-share chart over 8 weeks with interval bands, a table of every metric, and recommended `params.yaml` changes with evidence. Never present absolute predictions about real users. Propose param changes as a `cg/contracts/` PR citing the run ID.

## 8. Dashboard: `cg-dashboard`

A local web app on `127.0.0.1:9100` for the laptop in the demo. Tech is your choice (a small FastAPI or Flask app serving one page with MapLibre or deck.gl is enough). Pages:

| Page | Shows |
| --- | --- |
| **Live map** | `GET /internal/v1/pools/{poolId}/graph` on a city basemap, refreshed every 2 s: people as nodes colored by scene, sized by connections; isolated people ringed (low-outgoing from `sim_private` can be overlaid here); edges faint for candidates, solid for connections, bold for friendships; Maya highlighted; scene legend. Pool switcher. |
| **Replay** | Greedy and Common Ground side by side for one representative seed, week slider and play button, plus the isolated-share chart from the report. This is the 3:30 demo moment, so it must read in 10 seconds from across a room. |
| **Live metrics** | `/internal/v1/metrics` counters, including Laya decisive share and Muse fallback counts. |
| **Demo controls** | Counterpart toggle (live, synthetic), forced yes, relax check-in, reset demo, regenerate drops, advance a meetup (window open, completed), and a QR code for the second phone's deep link `exp://<LAN-IP>:8081/--/common-ground/demo?as=<liveUserId>` (LAN IP detected, editable). |

Title the live map "Muse's view of San Francisco (internal)". Large type, high contrast, works on a projector.

## 9. Tests

- Seed: schema validation, determinism (two runs, identical bytes), no name collisions with the clone seed, featured-identity rules hold, and no hidden-trait field or value from `sim_private` appears in any file under `data/seed/`.
- Laya renderer reproduces `laya_golden.json`.
- Monte Carlo: fixed-seed regression on a 30-person toy pool; metric functions on hand-built cases; policies receive identical populations and random streams.
- Dashboard: smoke test that every page renders with a fake internal API.

## 10. Done when

- M0: schema-valid, deterministic seed v0 for both pools with `demo.json` and Maya. Ship this first; the backend loads it.
- Tables written and loaded by the backend; extraction eval reported.
- A full run over 3 policies × 50 seeds × 25 sweep cells finishes on the laptop in under 15 minutes and produces the report.
- The dashboard shows the live pool during the phone demo, the replay, and working demo controls.
- `services/sim/STATUS.md` is current.

## 11. Out of scope

Anything in the app, any public API, real user data, absolute forecasts.
