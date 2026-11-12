# PRD 2: Backend and AI

**Agent:** backend · **Branch prefix:** `cg/backend/` · **Status file:** `services/api/STATUS.md`
**Writes only:** `services/api/**`, `packages/matching/**`

Read first: [CONTRACTS](../../contracts/CONTRACTS.md), [AGENT_RULES](AGENT_RULES.md), `contracts/openapi.yaml`, `contracts/openapi.internal.yaml`, `contracts/laya_questions.yaml`, `contracts/params.yaml`. [DESIGN](DESIGN.md) explains the product.

## 1. Goal

Serve the public API exactly as specified, with Muse doing the reasoning and the conversation, Laya answering fast yes/no and score questions, and `cg_matching` doing the math. Enforce every privacy guarantee on the server so the app can trust what it receives. Serve the internal API that the simulation and the backend-only dashboard use, including the demo controls.

## 2. Fixed

- Python 3.12, own `pyproject.toml` and lockfile in `services/api` and in `packages/matching` (uv suggested). FastAPI is suggested; any ASGI stack that serves both listeners is fine.
- Two listeners in one process: public on `CG_API_HOST:CG_API_PORT` (`0.0.0.0:8000`, phones reach it over the LAN) and internal on `CG_INTERNAL_HOST:CG_INTERNAL_PORT` (`127.0.0.1:9001`). No internal route is mounted on the public app (P9). Refuse to start if `DEMO_MODE` is not `1`.
- Request and response shapes from the two OpenAPI files, nothing more, nothing less. Tolerant reader rules for what you consume.
- `cg_matching` signatures from CONTRACTS §10. Laya questions and state templates from `laya_questions.yaml`, matching `laya_golden.json` byte for byte.
- Every number from `params.yaml`, every mode and pool from `modes.yaml`, every interest from `taxonomy.yaml`, all loaded from `CG_CONTRACTS_DIR` at startup.
- Never read `data/sim_private/`.
- Only two outbound peers: `MUSE_BASE_URL` and `LAYA_URL` (P10).

## 3. Components

Your internal structure is your choice. These are the jobs.

### 3.1 Seed load and extraction

`POST /internal/v1/seed/load` (and `cg-api-load-seed <poolId>`) reads `data/seed/<poolId>/`, validates every line against `contracts/schemas/`, creates users and serves avatars from `/static/avatars/<userId>.<ext>` on the public listener. Then, per persona:

1. **Muse extraction.** Give Muse the persona's activity and onboarding transcript and the taxonomy (IDs and labels). Ask for structured output: a list of `{ id, evidence }` using only taxonomy leaf IDs, at most 12. Reject IDs not in the taxonomy. Batch effort: high reasoning effort.
2. **Laya gate.** `sensitive_interest` for each item; sensitive = taxonomy flag OR Laya decisive yes OR Muse escalation yes. Sensitive items start `hidden`.
3. **Laya strength.** `interest_strength` → weight in [0, 1].
4. Store interests with `source` (`activity` or `onboarding`) and evidence (owner-only).

Cache extraction results by persona content hash so reloads are fast. The live onboarding for a real user (Maya) uses the same steps on her seed activity plus her live chat.

### 3.2 Onboarding chat

Muse runs a short, warm interview (about 2 minutes, 4 to 6 turns): what you're into, groups or one-to-one, group size, when you're free, neighborhood. It already knows the user's Facebook activity and says so in its first message ("I noticed you post a lot about hikes and pottery"). When it has enough, set `status: review` and return `proposedInterests` (extracted from activity and chat, gated and weighted as above), `proposedGroupSize` and `proposedAvailability`. `completeOnboarding` stores the confirmed choices and generates the first drop immediately. Low reasoning effort for turns; a turn must return in under 8 s or fall back to a templated next question (D4).

### 3.3 Matching package (`packages/matching`, import name `cg_matching`)

Pure functions, no I/O (CONTRACTS §10). Implement:

- **Vectors.** Leaf weight from extraction; parents get `parentWeightFactor` × child weight; IDF across the pool when `idf` is true. Hidden interests excluded; sensitive interests excluded unless `sharedSensitiveOptIn`.
- **Candidates.** Cosine similarity after hard filters: distance (`distanceMaxKm`, city mode only), at least `minOverlapSlotsPerWeek` overlapping availability slots, age band in `ageBands`, `trustFloorOk`, not blocked either way, not already connected. Keep the top `knnK` above `minCosine`.
- **Scenes.** Leiden communities on the kNN graph (`igraph` + `leidenalg`), resolution `leidenResolution`, deterministic for a seed. Scene label = top two shared level-2 labels.
- **Ranker.** Score(A, B) = P(A connects) × P(B connects) × P(both show) × P(meet again), from `LayaTables` (missing rows: fall back to the cosine-scaled prior and say so in a debug field).
- **Fairness in `build_drops`.** Exposure cap per day, isolation boost for users with zero connections (they get priority slots, and appear in more drops), at most `diversityMaxPerScene` cards per scene per drop.
- **Groups (`form_group`).** Maximize the lowest pairwise score; for 3 or more members everyone shares at least `minSharedWithOthers` interest with at least `minOthers` others; respect each member's size range; if no valid group, the best smaller valid group, else `fallback_1to1`.
- **`shared_interests(pool, a, b, level, limit)`.** The only place overlap is computed. Applies P1, P2 and P4. Order: highest combined weight first, then ID.

Unit-test every function, including determinism (same inputs and seed, same output) and the fairness limits.

### 3.4 Drops and discovery

- A user has one active pool at a time. `optIn` to another available pool switches it (Maya can switch from the city pool to the event pool in the demo); connections and threads carry over, drops do not.
- Drops are generated on `completeOnboarding`, on `optIn` to a new pool, daily per `drops.refreshHours`, and on `POST /internal/v1/drops/regenerate`.
- `DEMO_MODE`: Maya's first drop starts with `demo.json` `featuredIds` in order (they must still pass the hard filters; log loudly if one does not).
- **Drop reason.** Muse writes one line per card (max 160 chars) from **only** the coarse shared interests and distance band. It never sees the rest of either profile. Cache per pair.
- `decideSuggestion`: record privately; when both connected, create Connection and thread, post Muse's intro and starters (section 3.5), emit `connection.created` to both.
- `sayHi`: `opener_ok` through Laya (decisive) or Muse (uncertain); enforce `openers.perPersonPerWeek` and `maxChars`. Rejected openers are not delivered and not stored beyond an audit line.
- `replyHi` creates a mutual Connection; `dismissHi` is silent (P6).
- Groups: `requestGroup` sends invites, `form_group` decides on acceptance; group thread with Muse's group intro.

### 3.5 Muse in conversations

- **Intro and starters** after a mutual connect: names (first names for private profiles), the full-depth shared interests from `shared_interests`, nothing else about either person. Three starters, each under 90 characters.
- **Prompt privacy rule.** Any Muse prompt that produces text shown to user X about user Y contains only what X may see about Y (P1 to P4), built from `shared_interests` and PersonCard fields. Write a test that inspects prompt payloads.
- **Message screening.** `message_flag` on each message; decisive yes or Muse-confirmed yes holds the message and sends the sender a system note. Do not block on Laya being slow: deliver after 1.5 s if no answer, and flag asynchronously.

### 3.6 Meetup agent

`planMeetup` returns `proposing` immediately and runs Muse as a tool-using agent (Responses API tool calls) with:

| Tool | Does |
| --- | --- |
| `search_venues(activity_types, near, max_km)` | Search the seeded venue list for the pool; public places only |
| `get_availability(user_ids)` | Overlapping slots for the attendees |
| `get_shared_interests(user_ids)` | Group overlap via `shared_interests` |
| `propose_options(options)` | Save 2 or 3 options (activity type from `laya_questions.yaml#activityTypes`, venue, start, end, reason) and move to `voting` |
| `create_event(meetup_id, option_id)` | Confirm, set `eventLabel`, notify attendees |
| `send_message(thread_id, text)` | Post as Muse in the thread |
| `reschedule(meetup_id, reason)` | Back to `voting` with new options |

Rank candidate options with `accept_activity` and `show_up` tables for the attendees. First meetup with someone new: prefer daytime or group options (DESIGN, Trust). Votes: the first option every attendee voted yes on wins; ties go to the earliest start. Fallback without Muse: pick the top-scored venue for the top shared activity and template the reason (D4).

Seed the venue list yourself in `services/api/data/venues/<poolId>.json`: about 60 real public places in San Francisco and about 15 near Meta's Menlo Park campus for the event pool (parks, cafes, game cafes, climbing gyms, studios, museums, libraries), each tagged with activity types. Public places only.

### 3.7 Map, location and density

- `updateLocation` stores the latest foreground location; reject updates closer together than `location.minIntervalS` with `rate_limited`.
- Effective precision and pin visibility per CONTRACTS §5. Neighborhood positions are **snapped** to a stable cell center (for example the H3 cell that fits `privacy.neighborhoodRadiusM`), never randomly jittered per request, so repeated requests cannot be averaged into a real position (P7).
- Density: H3 at `privacy.densityH3Resolution`, bins below `densityMinBinCount` dropped, polygons returned (P8).
- `meetupStatus` visible to attendees from `location.meetupWindowBeforeMin` before start until the end; maps to `limits.meetupStatusBeforeMin` in `/v1/config`.

### 3.8 Trust, safety and rewards

- Check-in accepted inside `checkin.geofenceM` and the window, or anywhere when `relaxCheckin`.
- A meetup counts when at least two attendees confirm each other (`showedUp`) and checked in. Counting moves connections to `met` and feeds trust and unlocks.
- Trust score (internal): confirmed show-up rate, mutual meet-again rate, account age, reports. Below `trust.floor`: no drops. Below `groupOnlyBelow`: group meetups only. New accounts group-only until the first confirmed meetup. Expose only `Me.capabilities`.
- Reports: `report_severe` via Laya, escalate to Muse when uncertain; severe pauses the reported account (no drops, no new threads) and Muse writes a summary for review (log it). Blocks remove the blocked user from every public response of the blocker.
- Unlocks from `params.unlocks`; leaderboard ranks scenes by meetups this week. Both behind flags.

### 3.9 Synthetic counterparts and demo controls

- `demo.json` lists `counterpartIds` and `liveUserId`. In `synthetic` mode every counterpart acts automatically: connect or accept with probability from the tables (or always with `forcedYes`), after a delay in `demo.syntheticDelayS`; reply in chat in character with Muse (low effort, short, using only that persona's public profile and what it may see of the other person); vote yes on the best option; check in at the window; answer feedback positively.
- In `live` mode, `liveUserId` acts only through requests from the second phone; other counterparts stay synthetic.
- Switching mode mid-thread works: pending actions for `liveUserId` are picked up by the synthetic actor within one delay (D3).
- `/internal/v1/demo/reset` deletes live interactions and regenerates drops in under 10 s (D2). `/internal/v1/demo/meetups/{id}/advance` shifts times so check-in or feedback can be shown now.
- `fakeLocation` from `demo.json` (or the internal API) is served in `config.demo.fakeLocation`.

### 3.10 Realtime

WebSocket per user at `/v1/ws?user=`. Emit the events in CONTRACTS §6 after the state change is committed. A single-process in-memory hub is fine for the demo; Redis pub/sub only if you run several workers.

### 3.11 Laya and Muse clients

- **LayaClient:** renders states from the shared templates, batches requests, caches by `(questionsVersion, question, sha256(state))`, applies the decisive rule, returns `p` and whether it was decisive. `LAYA_FAKE=1` returns a deterministic probability from the hash.
- **Tables:** load `data/laya_tables/<poolId>/` (manifest `questionsVersion` must match, else ignore and log). Compute missing rows live (new users like Maya after onboarding) and keep them in your store.
- **MuseClient:** OpenAI-compatible at `MUSE_BASE_URL` with `MODEL_API_KEY`, model `MUSE_MODEL` (check `GET /v1/models` at startup and log the list). Use the Responses API for tool calls and structured outputs. Reasoning effort low for live chat, high for batch extraction; never `none`. Timeouts: 8 s live, 60 s batch, one retry. `MUSE_FAKE=1` returns templated deterministic outputs for every use.
- Log every Muse and Laya call with latency and fallback use; expose counts in `/internal/v1/metrics`.

### 3.12 Internal API

Implement `openapi.internal.yaml`: export (valid against `pool_export.schema.json`), live graph with scenes, metrics, seed load with job status, table reload, drop regeneration and demo controls.

## 4. Tests

- **Contract:** every public and internal response in your test suite validates against the OpenAPI schemas; all `openapi.yaml` examples are reproducible by a seeded fixture (Prism parity).
- **Privacy:** one test per P1 to P10, written as an attacker would (for example, collect every response for a user across all endpoints and assert no non-shared interest ID appears; request density for a 9-person area and assert no bin).
- **Laya rendering:** `laya_golden.json` reproduced byte for byte.
- **Matching:** determinism, filters, fairness, group rules.
- **Fakes:** the full demo flow passes end to end with `MUSE_FAKE=1 LAYA_FAKE=1`.

## 5. Performance

p95 under 300 ms for every GET and non-AI POST with 400 users loaded. Seed load with cached extraction under 60 s. Demo reset under 10 s.

## 6. Done when

- M0: every route returns its contract example; `/v1/config` built from params; `cg_matching` importable with frozen signatures and naive bodies. Ship this first; the sim and ios agents build on it.
- The full demo script runs against real Muse and Laya, and again with both fakes.
- All tests in section 4 pass; `services/api/STATUS.md` is current.

## 7. Out of scope

Real authentication, Facebook APIs, push notifications, horizontal scaling, any UI (the dashboard belongs to the sim agent).
