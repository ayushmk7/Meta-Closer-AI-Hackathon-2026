# PRD 2: Backend and AI (v2)

**Agent:** backend · **Branch prefix:** `cg/backend/` · **Status file:** `services/api/STATUS.md`
**Writes only:** `services/api/**`, `packages/matching/**`

Read first: [CONTRACTS](../../contracts/CONTRACTS.md), [AGENT_RULES](AGENT_RULES.md), `contracts/openapi.yaml`, `contracts/openapi.internal.yaml`, `contracts/params.yaml`, `contracts/connectors.yaml`, `contracts/laya_questions.yaml`, `contracts/schemas/`. [DESIGN](DESIGN.md) explains the product and why v2 changed.

## 1. Goal

Serve the public API exactly as specified, with:

- **Muse** reasoning in the open: understanding Muse bar requests, writing plan copy, and running the logistics as a tool-using agent whose every action is a visible step.
- **Laya** answering fast yes/no and score questions.
- **`cg_matching`** doing the math: proposing plans, ranking them per user, forming groups, estimating travel.
- **Simulated providers** for connectors, booking and payments, fed by the seed.

Enforce every privacy guarantee (P1 to P11) and the autonomy bounds on the server, so the app can trust what it receives. Serve the internal API that the simulation and the dashboard use, including the demo controls.

## 2. Fixed

- Python 3.12, own `pyproject.toml` and lockfile in `services/api` and in `packages/matching` (uv suggested). FastAPI is suggested; any ASGI stack that serves both listeners is fine.
- Two listeners in one process: public on `CG_API_HOST:CG_API_PORT` (`0.0.0.0:8000`) and internal on `CG_INTERNAL_HOST:CG_INTERNAL_PORT` (`127.0.0.1:9001`). No internal route is mounted on the public app (P9). Refuse to start if `DEMO_MODE` is not `1`.
- Request and response shapes from the two OpenAPI files, nothing more and nothing less. Tolerant reader rules for what you consume.
- `cg_matching` signatures from CONTRACTS §10. Laya questions and templates from `laya_questions.yaml`, matching `laya_golden.json` byte for byte.
- Every number from `params.yaml`, every mode and pool from `modes.yaml`, every provider from `connectors.yaml`, every interest from `taxonomy.yaml`, all loaded from `CG_CONTRACTS_DIR` at startup.
- Never read `data/sim_private/`.
- Only two outbound peers: `MUSE_BASE_URL` and `LAYA_URL` (P10). Connectors, booking and payments are simulated in-process. Never fetch a URL a user pastes.

## 3. Components

Your internal structure is your choice. These are the jobs.

### 3.1 Seed load and extraction

`POST /internal/v1/seed/load` (and `cg-api-load-seed <poolId>`) reads `data/seed/<poolId>/`, validates every line against `contracts/schemas/`, creates users, venues and plans, and serves avatars at `/static/avatars/<userId>.<ext>` and venue photos at `/static/venues/<venueId>.<ext>` on the public listener. For each synthetic persona, it connects the providers in `connectedProviders` (their `connectors.jsonl` records become active) and marks the persona set up. Plans with `seedJoinIds` start with those joins. Maya starts not opted in, with no connectors; her records are activated when she connects live.

Per persona (and again for a live user after each connect or disconnect):

1. **Muse extraction.** Give Muse the persona's Facebook activity and active connector records (never busy blocks) plus the taxonomy (IDs and labels). Ask for structured output: interests as `{ id, evidence }` using only taxonomy leaf IDs, at most 12; and signals as `{ recordIds, kind, label, interestIds, venueId?, strength }`, using only the kinds in `connectors.yaml`. Reject unknown IDs. Batch effort: high.
2. **Laya gates.** `sensitive_interest` for each interest; `sensitive_place` for each place signal. Sensitive = taxonomy flag, OR venue `sensitive: true`, OR Laya decisive yes, OR Muse escalation yes. Sensitive items start `hidden` and never drive plans or nudges (P4).
3. **Laya strength.** `interest_strength` → weight in [0, 1].
4. Store interests with `source` (`activity`, `connector`, `muse_bar`, `manual`) and owner-only evidence. Store signals with `provider` (`facebook` for activity).

Rule-based signals need no model: a `frequent_place` is a venue with at least `nudges.frequentPlaceVisits30d` `place_visit` records in 30 days; a `routine` comes from Strava routine records; a `ticket` from ticket records. Cache extraction by content hash so reloads are fast. `busy` records become busy blocks.

### 3.2 Setup, connectors and calendar

- `optIn`, `optOut` as in CONTRACTS. `optOut` withdraws open joins, deletes signals and removes the user from matching and the internal map.
- `getSetup` returns Muse's short review text (low effort, at most 2 sentences, first person), proposed interests and signals (including hidden and sensitive ones, owner-only), and proposed group size and travel. `suggestedProviders` lists the connectors with seeded records for this user that are not connected yet. `completeSetup` stores the choices, sets `setupComplete`, applies `museSettings` defaults from `params.muse`, and builds the first feed.
- `connectConnector`: for simulated providers, activate the user's seeded records for that provider, re-run extraction, and emit `signals.updated` and `me.updated`. For `device_calendar`, mark it connected; busy blocks arrive through `syncCalendar`. `disconnectConnector` deletes the provider's records, signals, evidence lines and busy blocks, and emits the same events. `coming_soon` returns 409 `conflict`.
- `syncCalendar`: replace the user's device busy blocks inside the horizon, record `applied` directives (advancing each meetup's `calendar` step for that attendee), and return the directives that should exist now. Emit `calendar.changed` to a user whenever one of their directives changes. Directive titles and notes never contain another user's name (P7).

### 3.3 Matching package (`packages/matching`, import name `cg_matching`)

Pure functions, no I/O (CONTRACTS §10). Implement:

- **Vectors.** Leaf weight from extraction; parents get `parentWeightFactor` × child weight; IDF across the pool when `idf` is true. Hidden interests are excluded; sensitive interests are excluded unless `sharedSensitiveOptIn`.
- **Candidates** (pair affinity). Cosine similarity after hard filters: age band in `ageBands`, `trustFloorOk`, not blocked either way. Keep the top `knnK` above `minCosine`. Used for scenes and group formation, never shown.
- **Scenes.** Leiden communities on the kNN graph (`igraph` + `leidenalg`), resolution `leidenResolution`, deterministic for a seed. Scene label = top two shared level-2 labels.
- **`travel_minutes`.** Haversine km × `travel.detourFactor` ÷ `speedsKmh[mode]` × 60 + `overheadMin[mode]`, rounded up.
- **`propose_plans`.** For each scene: its top activity types (`laya_questions.yaml#activityTypes` linked to the scene's interests; keep that mapping in the package) × open public venues that support them near the scene's members × windows in the next `plans.horizonDays` when many members are free (busy blocks, else availability), at least `plans.minLeadHours` ahead, up to `plans.proposalsPerSceneWeek` per scene. Add one plan per strong visible `frequent_place` or `routine` signal at that venue or area (`origin: signal`). Size from `plans.defaultSize`, cost from the venue's booking. Target interests come from the scene, never sensitive ones. Deterministic for `rng`.
- **`rank_plans`.** Per user: hard filters (already joined; calendar conflict with `calendar.minFreeBufferMin`; travel over `travel.maxMinutes` for every allowed mode; size outside their range; a plan only for invitees; trust floor). Score = `p_join(u, type)` × `p_show(u, type)` × interest fit (cosine of the user's vector with the plan's target interests) × fill likelihood (current joins plus expected joins from users with the plan in their top ranks, against `size.min`) × travel penalty × (1 + `signalBoost` if a visible signal points to the venue or activity) × (1 + `isolationBoost` for users with no met connections). Drop plans below `plans.fillLikelihoodFloor`. Fairness: a plan appears in at most `plans.exposureCapPerDay` carousels per day (highest scorers first, then the isolated); at most `feed.maxPerActivityType` per activity type and `feed.maxPerScene` per scene; `feed.size` total.
- **`form_groups`.** Order the interested users by seat priority (`groups.seatPriority`: no met connections first, then earliest join). Split them into groups within the plan's size range and the venue's `capacityPerSlot`. Maximize the lowest pairwise score (affinity × `p_meet_again`) in each group. Every member of a group of 3+ shares at least `minSharedWithOthers` interest with at least `minOthers` others. Strangers never form a group smaller than `groups.strangerSizeMin`; invite plans with only met people may use `metSizeMin`. Respect each member's size preference. Return the leftovers as `unseated_ids`.
- **`shared_interests`, `plan_overlap`.** The only places overlap is computed. Apply P1, P2 and P4. Order: highest combined weight first, then ID. `plan_overlap` returns nothing below `privacy.crowdMinCount` joined users.

Unit-test every function, including determinism (same inputs and seed, same output), filters, the fairness caps and the group rules.

### 3.4 Plans, feed and joins

- **Inventory.** Load seed plans; propose more nightly (and on `POST /internal/v1/plans/regenerate`) with `propose_plans`. Muse writes `title` (at most 60 chars), `description` and the per-user `reason` (at most 160 chars) from the plan and only the coarse overlap the viewer may see; cache per plan and per user-plan pair. Templates are the fallback.
- **`getFeed`.** `rank_plans` output as `PlanCard`s, built per viewer: `crowd` from `plan_overlap` (P2), `travel` from the viewer's neighborhood centroid with their fastest allowed mode, `checks` (calendar fit with the day name, travel, spots, cost "· Muse can book it" for prepaid), owner-only `because` lines from the signals that boosted the plan, `myJoin`. `museStatus` summarizes the viewer's meetups in `setting_up` and pending approvals ("Muse is setting up 1 plan for you", "Muse needs your OK on 1 thing"), else null. `prompts`: `feed.promptChips` short requests built from the viewer's top interests. In DEMO_MODE, Maya's first feed starts with `demo.json` `featuredPlanIds` in order (log loudly if one fails a hard filter, and show it anyway).
- **`getPlan`.** `PlanDetail`: description, `museWillHandle` (built from the plan: booking or "No booking needed", "Ask you before paying $35" for prepaid, calendar, chat, leave-by), `safety`, `formsAt`, `alternatives` (same activity type within the horizon, at most `plans.alternativesMax`) and `directions`. `directions.apple` = `https://maps.apple.com/?daddr={lat},{lng}&dirflg=r`; `directions.google` = `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}&travelmode=transit`.
- **`askMuse`.** Muse (low effort, structured output, `muse.liveTimeoutS`) turns the text plus the conversation so far into a filter: activity types, interests, a time window (resolved against the viewer's calendar), a max travel time, and an optional venue. A pasted Google Maps link is parsed locally (place name and coordinates from the URL) and resolved to the nearest seeded venue by name and distance, never fetched. Apply the filter to the viewer's ranked plans. If nothing fits and the request is plan-shaped, create a plan (screen with `plan_ok` first; Laya decisive or Muse) with `origin: muse`, a time from free/busy and a venue chosen with `choose_venue` logic, then return it as `createdPlanId`. The reply is 1 or 2 first-person sentences. Fallback without Muse: keyword match on taxonomy labels and activity types, with templated replies. Rate limit `muse.askPerHour`.
- **`createPlan`.** Same pipeline, from the user's words, with `origin: user` (or `invite` with `inviteUserIds`, which must all be `met` with the creator; an invite plan is visible only to them, and its size minimum is `metSizeMin` only if everyone is met). Requires `capabilities.canCreatePlans` and `plans.userPlansPerWeek`. The creator is joined automatically. Screened out → 422 `screened`.
- **`joinPlan`.** Idempotent. Enforce `openJoinsMax`, status, size and hard filters. Create the hold directive when `calendarHolds`. Emit `join.updated`, and `feed.updated` to others whose crowd line changed. Form the plan immediately when it is full, or in DEMO_MODE when `size.min` is reached (`plans.demoFormAtMin`).
- **Formation** (scheduler at `formsAt`, on full, in demo at min, and via `POST /internal/v1/plans/{planId}/form`). Run `form_groups`. For each group: create a meetup in `setting_up`, the group thread and Connections (`new`) between every pair, set joins to `matched`, then start the agent (§3.5). Leftovers become `not_filled` with `alternatives`; their holds become `none`. Emit `join.updated`, `meetup.updated`, `connection.created`, `thread.updated`.
- **`withdrawJoin`.** Silent (P6). The hold becomes `none`.

### 3.5 The Muse agent (visible steps)

Each new meetup gets one agent run. Muse runs as a tool-using agent (Responses API tool calls, low effort, `muse.liveTimeoutS` per decision) with the tools below. **Every tool call appends or updates a `MuseStep`** with short, plain copy: past tense when done ("Booked 3 wheels at Hayes Clay Studio"), present or future otherwise ("Waiting for you to OK $35", "Add it to everyone's calendar"), and emits `meetup.step` to every attendee. In DEMO_MODE, wait `demo.stepDelayS` between visible steps so the timeline reads on stage.

| Tool | Step kind | Does |
| --- | --- | --- |
| `open_group_chat(meetup_id)` | `group_chat` | Post Muse's intro and 3 starters (§3.6); done at formation |
| `find_common_time(meetup_id, window)` | `find_time` | Free/busy for all attendees (busy blocks, else availability) around the plan's time; "Everyone's free Saturday 10 to 12" |
| `estimate_travel(meetup_id, venue_ids)` | `choose_venue` | Minutes per attendee via `travel_minutes`; used to pick or swap venues by the longest trip |
| `search_venues(activity_types, near, max_minutes)` | `choose_venue` | Seeded public venues for the pool |
| `check_availability(venue_id, start, party_size)` | `check_availability` | Simulated inventory (`capacityPerSlot`, hours, demo `failNextBooking`) |
| `request_payment(meetup_id, user_id, amount, payee, fallback)` | `payment` | Within `spendWithoutAskingCents`: pay and mark done ("Paid $X (within your auto-spend limit)"). Otherwise create an `Approval` (`payment`, `simulated: true`, `fallback` copy, `expiresAt` = min(now + `muse.approvalExpiresHours`, formsAt or start − 2 h)), set the step to `needs_you`, emit `approval.requested` and post an `approval` attachment in the thread for that user |
| `book(venue_id, start, party_size)` | `book` | Simulated booking; returns a confirmation code like `HC-4821`, or fails |
| `set_calendar(meetup_id, desired)` | `calendar` | Write each attendee's directive; the step is done when every attendee with a calendar has applied it (skipped for those without) |
| `create_event(meetup_id)` | `event` | Private Facebook Event label "Private event · 3 going"; meetup → `confirmed` |
| `schedule_reminders(meetup_id)` | `reminder` | `travel.leaveBy` per attendee; a day-of reminder message `muse.reminderBeforeMin` before start |
| `post_message(thread_id, text, attachments)` | none | Post as Muse |
| `reschedule(meetup_id, start?, venue_id?)` | `reschedule` | Inside the bounds (CONTRACTS §5): apply, rebook, update the calendar. Outside them: a `change` approval for each attendee |
| `backfill(meetup_id)` | `backfill` | Seat the best still-`interested` or `not_filled` user from the same plan via `form_groups` with the remaining members fixed |
| `cancel(meetup_id, reason)` | `cancel` | Cancel, release holds, refund paid shares (`refund` step), post alternatives |

**Default sequence** (the scripted planner, which is also the fallback when Muse is down or `MUSE_FAKE=1`): `group_chat` → `find_time` → `check_availability` → `payment` for each attendee if prepaid (in parallel) → `book` once every prepaid attendee approved or fell back → `calendar` → `event` → `reminder`. Muse may reorder within this sequence, retry, or choose alternatives. It may not skip `payment` for prepaid plans or act outside the autonomy bounds; enforce those bounds in the tools, not the prompt.

**Payment fallbacks** (in bounds, no approval needed): when an approval is declined or expires, use pay at venue if `payAtVenueAllowed` (my payment `pay_at_venue`, step "Hayes Clay Studio will hold your wheel; you'll pay there"). Otherwise offer the same plan type at a free venue (a `change` approval to the group) or release that person's seat with "Maya can't make this one", backfill and continue. Never charge without approval (P11).

**Booking failures** stay visible: mark the step `failed` with a short reason, then append what Muse did next ("Full at 10, so I booked 11 instead; everyone's still free" as a `reschedule` step), or ask with a `change` approval if that leaves the bounds.

**Changes after confirmation.** `leaveMeetup`: post "Maya can't make it" (nothing more, P6), then backfill (if `autoBackfill` for the remaining members), continue if the group is still at least the minimum, or cancel with alternatives. Weather or venue closures can be simulated through the same path.

### 3.6 Muse in conversations

- **Intro and starters** at formation: first names (first name only for private profiles), full-depth shared interests from `shared_interests` across the group, the plan, and "I'm handling the booking and the calendar". Three starters, each under 90 characters.
- **`toMuse` messages** (flag set, or the text starts with "Muse"): Muse classifies the request (change time, change venue, add a note, cancel, question) and acts through the tools above, replying with what it did and a `muse_steps` attachment. Questions get a short answer from the plan details. Anything outside its bounds becomes a `change` approval to each attendee; the change applies only when all approve.
- **Proactive messages**: day-of reminder; "Daniel is on the way" when an attendee sets status; a backfill welcome.
- **Prompt privacy rule.** Any Muse prompt that produces text shown to user X about user Y contains only what X may see about Y (P1 to P4, P7), built from `shared_interests`, `plan_overlap` and `PersonCard` fields. Write a test that inspects prompt payloads.
- **Message screening.** `message_flag` on each message; a decisive yes or a Muse-confirmed yes holds the message and sends the sender a system note. Don't block on a slow Laya: deliver after 1.5 s with no answer, and flag asynchronously.

### 3.7 Nudges

Daily, and when signals change: for each opted-in user with a visible signal of strength at least `nudges.minSignalStrength`, find the best open plan that the signal boosts (or propose one at that venue). Write the nudge copy with Muse (about the activity and the place, never about being alone), set `surfaces` (`plans` always; `home` for the strongest; `events` for `ticket` signals), and enforce `nudges.maxPerWeek`, one nudge per signal, `quietHours` and `expiresHours`. `dismissNudge` with `mute: signal` stops that signal's nudges. Nudges never come from hidden or sensitive signals. Emit `nudge.created`.

### 3.8 Trust, safety and rewards

- Check-in is accepted inside `checkin.geofenceM` and the window, or anywhere when `relaxCheckin`. Don't store the location beyond the result (P8).
- A meetup counts when at least two attendees confirm each other (`showedUp`) and checked in. Counting moves connections to `met` (`canPlanAgain` true) and feeds trust and unlocks.
- Trust score (internal): confirmed show-up rate, mutual meet-again rate, account age, reports. Below `trust.floor`: no feed and no joins. Strangers always meet in groups of `groups.strangerSizeMin` or more. Expose only `Me.capabilities`.
- Reports: `report_severe` via Laya, escalating to Muse when unsure; severe pauses the reported account (no feed, no joins, removed from forming groups with a backfill), and Muse writes a summary for review (logged). Blocks keep two people out of the same group forever (P9).
- Unlocks from `params.unlocks`.

### 3.9 Synthetic counterparts and demo controls

- `demo.json` lists `counterpartIds`, `liveUserId`, `privateCounterpartId`, `heroPlanId` and `nudgePlanId`. In `synthetic` mode, counterparts act automatically after a delay in `demo.syntheticDelayS`. With `forcedYes`, they join the hero plan as soon as Maya does (enough to reach `size.min`, including `privateCounterpartId`), approve payments, agree to changes, check in at the window and answer feedback positively. Without it, they act with table probabilities. They chat in character with Muse (low effort, short, using only that persona's public profile and what it may see of others), and sometimes address Muse.
- In `live` mode, `liveUserId` acts only through requests from the second phone; other counterparts stay synthetic.
- Switching mode mid-plan works: pending actions for `liveUserId` are picked up by the synthetic actor within one delay (D3).
- `/internal/v1/demo/reset` restores the seed state (Maya not opted in, seed plans and joins, no meetups, no nudges) in under 10 s (D2). `triggerNudge` creates Maya's nudge for `nudgePlanId` now. `formPlan` forms a plan now. `failNextBooking` makes the next `book` fail once. `advanceMeetup` shifts times (`leave_by`, `window_open`, `completed`).
- `fakeLocation` from `demo.json` (or the internal API) is served in `config.demo.fakeLocation`; `simulatedPayments` in `config.demo.simulatedPayments`.

### 3.10 Realtime

WebSocket per user at `/v1/ws?user=`. Emit the events in CONTRACTS §6 after the state change is committed, `meetup.step` on every step transition. A single-process in-memory hub is fine for the demo.

### 3.11 Laya and Muse clients

- **LayaClient:** renders states from the shared templates, batches requests, caches by `(questionsVersion, question, sha256(state))`, applies the decisive rule, and returns `p` and whether it was decisive. `LAYA_FAKE=1` returns a deterministic probability from the hash.
- **Tables:** load `data/laya_tables/<poolId>/` (the manifest `questionsVersion` must be 2, else ignore and log). Compute missing rows live (Maya after setup) and keep them in your store.
- **MuseClient:** OpenAI-compatible at `MUSE_BASE_URL` with `MODEL_API_KEY`, model `MUSE_MODEL` (check `GET /v1/models` at startup and log the list). Use the Responses API for tool calls and structured outputs. Reasoning effort low for the bar, chat and agent decisions; high for batch extraction and nightly copy; never `none`. Timeouts from `params.muse`, one retry. `MUSE_FAKE=1` returns templated deterministic outputs for every use, and the agent runs the scripted planner.
- Log every Muse, Laya and tool call with latency and fallback use; expose counts in `/internal/v1/metrics`, including `userDecisionsPerMeetup`.

### 3.12 Internal API

Implement `openapi.internal.yaml`: export (valid against `pool_export.schema.json`, including busy blocks, signals, `metIds` and live plans), live graph with scenes and formed groups, metrics, seed load with job status, table reload, plan regeneration, plan formation and the demo controls.

## 4. Tests

- **Contract:** every public and internal response in your test suite validates against the OpenAPI schemas; every `openapi.yaml` example is reproducible by a seeded fixture (Prism parity).
- **Privacy:** one test per P1 to P11, written as an attacker would. For example: collect every response for a user across all endpoints and assert no non-shared interest ID, no signal, no busy block and no other user's directive appears; join a plan with one other person and assert `crowd.sharedWithYou` is empty; assert no response before formation contains another user ID; decline an approval and assert no payment step completes.
- **Autonomy:** the tools refuse out-of-bounds actions without an approved `change` approval; prepaid plans never reach `book` without a payment decision or fallback for every attendee.
- **Agent:** the scripted planner produces the default step sequence for the hero plan; a forced booking failure produces a failed step followed by a fallback step; reschedule via `toMuse` produces `reschedule` and `calendar` steps and new directives.
- **Laya rendering:** `laya_golden.json` reproduced byte for byte.
- **Matching:** determinism, filters, fairness caps, group rules, travel.
- **Fakes:** the full demo flow passes end to end with `MUSE_FAKE=1 LAYA_FAKE=1`.

## 5. Performance

p95 under 300 ms for every GET and non-AI POST with 400 users and 600 plans loaded. `askMuse` p95 under 6 s with real Muse and under 300 ms with the fallback. Seed load with cached extraction under 60 s. Demo reset under 10 s. Group formation through `confirmed` for the hero plan under 20 s with demo step delays.

## 6. Done when

- M0: every route returns its contract example; `/v1/config` is built from params; `cg_matching` is importable with frozen signatures and naive bodies. Ship this first; the sim and ios agents build on it.
- The full demo script runs against real Muse and Laya, and again with both fakes.
- All tests in section 4 pass, and `services/api/STATUS.md` is current.

## 7. Out of scope

Real authentication, real connector OAuth, real booking or payment providers, Facebook APIs, push notifications, horizontal scaling, any UI (the dashboard belongs to the sim agent).
