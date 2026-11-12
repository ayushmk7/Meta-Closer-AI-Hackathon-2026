# PRD 3: Seed data, Laya simulation and the backend-only dashboard (v2)

**Agent:** sim · **Branch prefix:** `cg/sim/` · **Status file:** `services/sim/STATUS.md`
**Writes only:** `services/sim/**`, `services/dashboard/**`, `data/**`

Read first: [CONTRACTS](../../contracts/CONTRACTS.md), [AGENT_RULES](AGENT_RULES.md), `contracts/schemas/`, `contracts/connectors.yaml`, `contracts/laya_questions.yaml`, `contracts/laya_golden.json`, `contracts/params.yaml`, `contracts/modes.yaml`, `contracts/openapi.internal.yaml`. [DESIGN](DESIGN.md) explains the product and why v2 changed.

## 1. Goal

Three things, all reproducible from a seed:

1. **Seed data** for two pools that the backend loads as if they were real Facebook users with connected apps: San Francisco (city, 300 people) and the Closer Together AI Hackathon (event, 80 people). For each pool: personas, Facebook activity, connector records, venues, an initial plan inventory, and the demo identities and plans.
2. **The Laya simulation.** Precompute Laya probability tables, then run Monte Carlo weeks to show that the Common Ground policy (plan ranking with fairness plus compatibility-first group formation) gets more isolated people into repeat meetups than a greedy, first-come policy does, across a robustness sweep. Relative claims only.
3. **The dashboard:** Muse's internal map of the whole pool with formed groups, the simulation replay, live agent metrics and the demo controls, on the laptop only.

## 2. Fixed

- Python 3.12. `services/sim` and `services/dashboard` each have their own `pyproject.toml` and lockfile and depend on `packages/matching` by path (read-only). Plan proposals and the Common Ground policy in the simulation are `cg_matching.propose_plans`, `rank_plans` and `form_groups`, never a re-implementation.
- Output formats from `contracts/schemas/` and `laya_questions.yaml#tables`. Laya states rendered with the shared templates, reproducing `laya_golden.json` byte for byte.
- Talk to the backend only through `CG_INTERNAL_URL`. Never touch its database.
- Hidden traits and ground truth stay in `data/sim_private/`. Nothing derived from them goes into `data/seed/` or `data/laya_tables/`.
- Fictional people only. No real names of private people, no photos of real people. Avatars are generated (illustrated or abstract) or properly licensed, listed in `avatars/PROVENANCE.md`.
- Venues: real public places (parks, trails, beaches, museums, libraries, well-known public venues) may use their real names and approximate public coordinates. Bookable businesses (studios, gyms, game cafes, restaurants) are fictional names in real neighborhoods, so nothing implies a partnership. Prices and inventory are invented and always shown as simulated.
- The dashboard binds to `CG_DASHBOARD_HOST:CG_DASHBOARD_PORT` (`127.0.0.1:9100`), has no route the app can reach, and is never linked from the app.

## 3. Seed generation: `cg-sim seed`

`cg-sim seed --pool pool_sf_city --seed 7` writes `data/seed/pool_sf_city/` and `data/sim_private/pool_sf_city/`. Same seed, same bytes. `cg-sim seed --check` validates everything against the schemas and runs `scripts/validate_contracts.py`.

**Personas** (`personas.jsonl`). For each person, sample in code (deterministically), then let Muse write the human text:

| Field | Rule (starting values; record your choices in STATUS.md) |
| --- | --- |
| Ground-truth interests | 3 to 8 taxonomy leaves, clustered so real scenes exist (bouldering + trail running, board games + D&D, ceramics + printmaking…). About 10% of people have one sensitive interest. |
| Hidden traits | Outgoingness and flakiness in [0, 1]; `params.sim.lowOutgoingShare` of people are low-outgoing with few existing friends: the target user |
| Home and neighborhood | Real San Francisco neighborhood names, points inside each, weighted toward residential areas; the event pool clusters around the Menlo Park venue in `modes.yaml` |
| Profile | About 30% private; age bands mostly 18 to 29; availability 3 to 8 slots; group size preference with min ≥ 3; travel prefs (max minutes 20 to 45; modes) |
| Connected providers | Each persona connects 1 to 4 providers, weighted by persona (Strava for runners, Spotify for concert-goers, Google Maps for most). Calendar for about 70%. |
| Names | Fictional, diverse, not colliding with the clone's seed people (Amina Rahman, Leo Ortiz, Priya Nair, Jordan Ellis, Elena Brooks, Theo Morgan, and the rest in `facebook-clone/src/data/seed.ts`) |

**Activity** (`activity.jsonl`). 2 to 4 weeks of synthetic Facebook activity per person, written by Muse from the ground truth, with realistic noise: passing mentions that are not real interests, interests that show up only in Group memberships or Event RSVPs, and sensitive interests that appear only indirectly.

**Venues** (`venues.jsonl`). About `params.sim.venuesCity` venues for San Francisco and `params.sim.venuesEvent` near the Menlo Park venue, covering every activity type that appears in the pool: parks, trails, beaches, cafes, game cafes, climbing gyms, ceramics and art studios, museums, libraries, bars with trivia, music venues, community centers. Each has hours, activity types and simulated booking (`none` for parks and trails; `reservation`, `day_pass`, `class` or `ticket` with a price, `capacityPerSlot` and `payAtVenueAllowed` for the rest). Include a few `sensitive: true` places (a place of worship, a clinic, a support-group space) that connector records can reference but plans never use. Venue photos are optional (generated or licensed, listed in `venue_photos/PROVENANCE.md`).

**Connector records** (`connectors.jsonl`). What each persona's connected apps would hand Muse over the last 30 days and the next 14, consistent with ground truth and with noise:

- `google_maps`: `place_visit` records (frequent places for real hobbies, one-off visits as noise, at least one frequent place for about half the pool) and `saved_place`.
- `strava`: weekly `routine` records for runners and cyclists (activity, day, part, area).
- `spotify`: `artist` records; `eventbrite`: `ticket` records for upcoming shows and events (some attended alone).
- `instagram`: `post` records with a place or hobby.
- `google_calendar` / `device_calendar`: `busy` blocks consistent with the persona's availability (work hours, a few evenings), for the next `params.calendar.horizonDays` days.
- About `params.sim.sensitiveSignalShare` of personas have visits to a sensitive place. That is the sensitive-gate eval set.

Records for providers a persona has not connected may still exist (they become visible only if that user connects, which only Maya does live).

**Plans** (`plans.jsonl`). The initial inventory for the next `params.plans.horizonDays` days, produced by `cg_matching.propose_plans` on the ground-truth export (`--use-ground-truth`) with Leiden scenes, plus Muse-written titles (at most 60 characters) and descriptions (cached). Add `seedJoinIds` so some plans already show "N in" on day one (never Maya). Plans start at least 12 hours after the demo day (`2026-11-13`) and inside the event pool window for the event pool.

**Maya** (`u_maya`, `cloneProfileId: "maya"`). Built from the clone's seed. Her activity is her posts, comments, Groups and Events in `facebook-clone/src/data/seed.ts` (read-only), translated to the activity schema. Her avatar is the clone's `assets/images/maya.jpg` (copy it and cite `facebook-clone/assets/provenance.md`). Her ground truth reflects those posts (coastal hikes, gardening, pottery and so on). Her `connectedProviders` is empty (she connects live), but she has seeded records ready for:

- `google_maps`: at least 4 visits to Lands End Trail in the past 30 days (drives the nudge), a saved ceramics studio, and weekly visits to a meditation center (`sensitive: true`), so the demo shows one place auto-hidden.
- `google_calendar`: busy blocks for her work week, leaving Saturday morning and Wednesday evening free, as the fallback when the stage phone's real calendar is empty.
- `eventbrite`: one ticket to a show this month.

Maya is in the city pool; the backend lets her opt into the event pool too.

**Demo identities and plans** (`demo.json`, both pools):

- `heroPlanId`: a **prepaid** plan (it shows the payment approval) matching Maya's top interests (the reference is a Saturday 10 AM wheel-throwing drop-in at a fictional Hayes Valley studio, $35, size 3 to 5), within her travel limit, free in her fallback calendar, formed by Maya plus counterparts.
- `nudgePlanId`: a **free** plan at Lands End Trail (a coastal walk) on a morning Maya is free.
- `featuredPlanIds`: 3 to 8 plans for her first feed, in order, including the hero and nudge plans, all passing her hard filters.
- `liveUserId`: a public profile sharing at least two of Maya's top interests, not in the hero plan's `seedJoinIds` (the second phone joins live). Must be in `counterpartIds`.
- `privateCounterpartId`: a private profile sharing at least one interest, in the hero plan's `seedJoinIds`, so the group reveal shows a first-name-only person.
- `counterpartIds`: every persona the synthetic actor drives, enough for the hero plan to reach `size.min` with Maya even without the second phone.
- `fakeLocation`: a point in Maya's neighborhood.

The event pool gets its own `demo.json`, with a hero plan like "Lunch walk with 4 other solo hackers".

Commit the seed, avatars and venue photos (keep the city pool under about 8 MB). Cache Muse outputs under `services/sim/.cache/` (gitignored) so reruns are free and identical.

## 4. Extraction eval: `cg-sim eval`

After the backend loads the seed (`POST /internal/v1/seed/load`, then poll the job), pull `GET /internal/v1/pools/{poolId}/export` and compare against ground truth:

- Interest precision and recall at leaf level and at level 2.
- **Sensitive-gate recall and precision for interests and for places.** Recall is the number that matters: a missed sensitive place could become a nudge.
- Signal recall: frequent places and routines found versus seeded.

Write `data/sim/runs/<runId>/extraction.json` and a short table for the report. Until the backend serves the export, `--use-ground-truth` builds the same export shape from ground truth, so everything downstream works.

## 5. Laya precompute: `cg-sim precompute`

From the export: vectors and candidates via `cg_matching`, then the tables in `laya_questions.yaml#tables`:

- `activity`: every person × every activity type: `join_activity` → `p_join`, `show_up` → `p_show`.
- `meet_again`: each person's top `params.sim.candidatesPerUser` candidate pairs.

That is about 21,000 Laya answers for the city pool, so batch them. Write `manifest.json` with `questionsVersion: 2`, the model and row counts, then call `POST /internal/v1/laya-tables/reload`. `--fake-laya` uses the same deterministic hash rule as the backend's `LAYA_FAKE`.

## 6. Monte Carlo: `cg-sim run`

numpy, no model calls inside the loop. 8 weeks of daily ticks (`params.sim.weeks`). Each week, `propose_plans` refreshes the inventory (the same function for every policy, so supply is identical). Each day:

1. **Carousels.** The policy picks each person's plans:
   - **random:** random open plans within travel.
   - **greedy:** the most-joined plans first, then the highest cosine fit; no exposure cap, no isolation boost, no diversity.
   - **common_ground:** `cg_matching.rank_plans`.
2. **Joins.** Each shown plan is joined with `p_join` × the join multiplier × a fatigue factor for people with many open joins (documented).
3. **Formation** at each plan's `formsAt`:
   - **random and greedy:** first come, first seated, in chunks of `size.max`; the remainder is seated if at least `size.min`; no compatibility rule.
   - **common_ground:** `cg_matching.form_groups`.
4. **Meetups.** Each seated person shows with `p_show` × the flake multiplier. A meetup happens if at least 2 show. For each pair that both showed, meet-again is drawn with `p_meet_again`.
5. **State.** Exposures, met pairs, meetups together. Friendship = `params.sim.friendshipMeetups` meetups together where both wanted to meet again.

Logistics are assumed handled by Muse for every policy, so the comparison isolates who sees which plan and who gets seated together.

**Metrics** per policy, seed and sweep cell: share of people with at least one friendship at weeks 4 and 8; share still isolated (no friendship) among the low-outgoing third (join with `sim_private`); plan fill rate; join-to-meetup rate; show-up rate; Gini of friend counts; median days to first meetup; share of low-outgoing people seated at least once.

**Robustness.** `params.sim.seeds` seeds per policy; sweep the flake and join multipliers over `params.sim.sweepMultipliers` (a 5 × 5 grid). A claim goes in the report only if it holds in every cell, with 95% intervals over seeds.

Stretch, reported separately: a "truth" world model where outcomes come from hidden traits while the policy sees only Laya tables, to test whether the policy still wins when its beliefs are imperfect.

## 7. Report: `cg-sim report`

`data/sim/runs/<runId>/REPORT.md` with the extraction and sensitive-gate eval, the headline relative result ("Common Ground leaves X% of low-outgoing people isolated at week 8 versus Y% for greedy, in all 25 sweep cells"), the isolated-share chart over 8 weeks with interval bands, a table of every metric, and recommended `params.yaml` changes with evidence (exposure cap, isolation boost, fill-likelihood floor, form lead time). Never present absolute predictions about real users. Propose param changes as a `cg/contracts/` PR citing the run ID.

## 8. Dashboard: `cg-dashboard`

A local web app on `127.0.0.1:9100` for the laptop in the demo. The tech is your choice (a small FastAPI or Flask app serving one page with MapLibre or deck.gl is enough). Pages:

| Page | Shows |
| --- | --- |
| **Live map** | `GET /internal/v1/pools/{poolId}/graph` on a city basemap, refreshed every 2 s: people as nodes colored by scene, sized by connections; isolated people ringed (low-outgoing from `sim_private` can be overlaid); formed groups as hulls around their members, with a line to the venue; edges faint for candidates, solid for `met`, bold for friendships; Maya highlighted; a scene legend; a pool switcher. Title: "Muse's view of San Francisco (internal)". |
| **Replay** | Greedy and Common Ground side by side for one representative seed, with a week slider and play button, plus the isolated-share chart from the report. This is the 3:35 demo moment, so it must read in 10 seconds from across a room. |
| **Muse at work** | `/internal/v1/metrics`: Muse steps done and failed, approvals requested and approved, booking fallbacks, user decisions per meetup (the cognitive-load number), nudges shown and joined, Laya decisive share, Muse fallbacks. |
| **Demo controls** | Counterpart toggle (live, synthetic), forced yes, relax check-in, fail next booking, trigger Maya's nudge, form the hero plan now, advance a meetup (leave-by, window open, completed), regenerate plans, reset demo, and a QR code for the second phone's deep link `exp://<LAN-IP>:8081/--/common-ground/demo?as=<liveUserId>` (LAN IP detected, editable). |

Large type, high contrast, works on a projector.

## 9. Tests

- Seed: schema validation; determinism (two runs give identical bytes); no name collisions with the clone seed; `demo.json` rules hold (hero plan prepaid and passing Maya's filters, nudge plan free at her frequent place, `liveUserId` not pre-joined, private counterpart pre-joined); every plan's venue supports its activity type and is open at that time; no sensitive venue hosts a plan; no hidden-trait field or value from `sim_private` appears in any file under `data/seed/`.
- The Laya renderer reproduces `laya_golden.json`.
- Monte Carlo: a fixed-seed regression on a 30-person toy pool; metric functions on hand-built cases; policies receive identical populations, plan inventories and random streams.
- Dashboard: a smoke test that every page renders with a fake internal API.

## 10. Done when

- M0: schema-valid, deterministic seed v0 for both pools, with venues, plans, connector records, `demo.json` and Maya. Ship this first; the backend loads it.
- Tables are written and loaded by the backend; the extraction and sensitive-gate eval is reported.
- A full run over 3 policies × 50 seeds × 25 sweep cells finishes on the laptop in under 15 minutes and produces the report.
- The dashboard shows the live pool with forming groups during the phone demo, the replay, the Muse metrics and working demo controls.
- `services/sim/STATUS.md` is current.

## 11. Out of scope

Anything in the app, any public API, real user data, real venue partnerships or prices, absolute forecasts.
