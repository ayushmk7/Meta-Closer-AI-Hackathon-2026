# Backend (`services/api`)

Python 3.12 (`>=3.12,<3.13`), FastAPI + uvicorn, package `cg_api` (`services/api/pyproject.toml`). One process, in-memory state, no database. Everything below was checked against the code on `main` at #204. Bring-up commands are in [runbook.md](runbook.md); the current demo state is in [status.md](status.md).

Related pages: [muse.md](muse.md) (Muse prompts and copy), [laya.md](laya.md) (Laya questions and tables), [matching-ml.md](matching-ml.md) (`cg_matching`), [sim.md](sim.md), [app.md](app.md), [e2e.md](e2e.md), [perf-and-bugs.md](perf-and-bugs.md), [decisions.md](decisions.md).

## Naming: "Meetups" in the product, `plans` in the API

The feature was renamed from **Plans** to **Meetups** on 2026-11-13: contracts and docs strings (#145), backend user-facing copy (#148, test labels #152), shell (#144), app (#146, fixtures #150) and seed pool descriptions (#147). Only text people read changed. Identifiers did not:

- Paths stay `/v1/plans`, `/v1/plans/{planId}/join`, `/v1/public/plans/{planId}`; operation IDs stay `getPlan`, `createPlan`, `joinPlan`; IDs keep the `pl_` prefix; modules stay `domain/plans.py`, `routes/plans.py`.
- In the code a **plan** is a proposed outing people can join ("I'm in"). A **meetup** (`/v1/meetups`, `mt_…`) is one group seated from a plan, with Muse's steps, approvals and a chat thread. The app calls both "meetups"; the API keeps the two resources apart.
- Renaming paths would have broken the frozen contract (`contracts/openapi.yaml`), the app's typed client and the e2e script for no user-visible gain.

## Process and ports

`cg-api` (`cg_api/cli.py:main`) builds both apps, loads the default pool, then runs two `uvicorn.Server`s in one asyncio loop:

| Listener | Default bind | Spec | Notes |
| --- | --- | --- | --- |
| public | `0.0.0.0:8000` (`CG_API_HOST`, `CG_API_PORT`) | `contracts/openapi.yaml` | phones reach it over the LAN; WebSocket at `/v1/ws` |
| internal | `127.0.0.1:9001` (`CG_INTERNAL_HOST`, `CG_INTERNAL_PORT`) | `contracts/openapi.internal.yaml` | `main` exits unless the host is loopback (P9); a middleware also returns 403 unless the request's `Host` and any `Origin` are loopback (#167: blocks DNS rebinding and CSRF from a browser page) |

Startup order (`cli.main`):

1. Refuse a non-loopback `CG_INTERNAL_HOST`.
2. `create_apps()`: exits with `refusing to start without DEMO_MODE=1` unless `DEMO_MODE=1`, then `ports.install_providers()` (real Muse, Laya, Copy, Extractor; `providers/__init__.py`, see the [module map](#module-map-servicesapisrccg_api)).
3. `seed.load(<first pool in contracts/modes.yaml>)`, which is `pool_sf_city`. This already loads **every** seeded pool, with SF as the primary (see [Seed loading](#seed-loading-and-the-primary-pool)).
4. Serve both listeners.

Nothing reads a `.env` file. `cg_api/settings.py` reads `os.environ` only, so the shell must export the variables (the runbook uses `set -a && . ../../.env && set +a`). `make api` does not load `.env` either.

Console scripts (`pyproject.toml`):

| Script | Entry | What it does |
| --- | --- | --- |
| `cg-api` | `cg_api.cli:main` | the server (both listeners) |
| `cg-api-load-seed <poolId>` | `cg_api.cli:load_seed` | `POST /internal/v1/seed/load` against the running server at `CG_INTERNAL_HOST:CG_INTERNAL_PORT`, then polls `getJob` every second until `done`/`failed` (exit 1 on failed) |
| `cg-api-precompute-muse <poolId>` | `cg_api.muse.precompute:main` | in-process Muse copy warm-up; never touches the running server (see [Muse](#muse-off-the-request-path)) |

## App factory (`app.py`)

- `create_apps()` returns `(public, internal)`.
- **Routes are auto-discovered.** Every module in `cg_api/routes/` (public) or `cg_api/internal/` (internal) that exposes `router = APIRouter()` is mounted. Each route sets `operation_id=<spec operationId>`.
- **Example fallthrough.** Every spec operation with no handler is still served: it answers with its OpenAPI example and logs `example fallthrough: <METHOD> <path> (<operationId>)`. It still enforces `X-CG-User` where the spec needs it. Four operations are fallthroughs on `main` (see the endpoint tables).
- `app.py` is frozen; new routes are new modules.

## Module map (`services/api/src/cg_api`)

| Path | Role |
| --- | --- |
| `cli.py` | `cg-api`, `cg-api-load-seed`, `is_loopback()` |
| `app.py` | app factory, route discovery, example fallthrough, internal loopback middleware |
| `settings.py` | `Settings` (env vars, [table below](#environment-variables)); `contract(name)` loads `contracts/*.yaml` once; `params` = `contracts/params.yaml` |
| `contracts.py` | both OpenAPI files as data: operations, `$ref` resolution, response validation, example synthesis |
| `deps.py` | `current_user` (the `X-CG-User` check), `base_url`, `User`/`Base`/`World` dependency aliases |
| `errors.py` | error envelope (CONTRACTS §7), `ApiError`, `UserMessage` |
| `ports.py` | Protocols `Muse`, `Laya`, `Extractor`, `Copy`, `AgentRunner` on `ports.ports`, stubs, `install_providers()`, `matching()` (lazy `cg_matching` import) |
| `providers/__init__.py` | `install(ports)`: real `MuseClient`, `LayaClient`, `MuseCopy` (cache `services/api/.cache/muse_copy.json`), `Extractor`; `simulated_book()` (booking codes like `CH-4821`, or None when full / `failNextBooking`) |
| `muse/__init__.py` | `MuseClient`: OpenAI SDK `responses.create` at `MUSE_BASE_URL`, one attempt (`max_retries=0`), timeout `params.muse.liveTimeoutS` (8 s); any failure raises `Unavailable`; `MUSE_FAKE=1` always raises. Logs `muse models: [...]` once at startup in a thread, with `NOT LISTED` if `MUSE_MODEL` is missing |
| `muse/copy.py` | `MuseCopy` (ports.Copy): templates plus a background Muse cache; all user-facing wording and formatting helpers |
| `muse/bar.py` | the Muse bar's understanding step: text to a filter over the viewer's ranked cards; keyword fallback; Google Maps links parsed locally, never fetched |
| `muse/extract.py` | `Extractor`: interests and signals from activity and connector records; Laya gates sensitivity and interest strength |
| `muse/precompute.py` | `cg-api-precompute-muse` |
| `laya/__init__.py` | `LayaClient` (ports.Laya), byte-exact state rendering from `contracts/laya_questions.yaml`, `LAYA_FAKE` hash formula, answer-field parser |
| `live_calendar.py` | live Google Calendar free/busy (#137) |
| `seed/__init__.py`, `seed/tiny/` | seed loader and per-user derivation; a tiny built-in seed used when `data/seed/<pool>` is missing |
| `store/__init__.py` | the in-memory `Store` (`store`), snapshot/reset, `counters` for metrics |
| `store/bridge.py` | store to domain `World` aliasing, `sync(uid)`, `changed()` |
| `store/views.py` | store to public JSON for profile, connectors, signals; `require_opted_in` |
| `realtime/__init__.py` | WebSocket hub: `connect`, `disconnect`, `emit` |
| `synthetic/__init__.py` | synthetic counterparts: approvals and templated chat replies |
| `agent/__init__.py` | `ScriptedRun`: Muse's default step sequence per meetup (pure; also the fallback when Muse is down) |
| `domain/world.py` | domain `World`: users, venues, plans, joins, meetups, threads, approvals, events; hooks `on_formed`, `on_decided`, `on_to_muse`, `on_approval`, `on_message` |
| `domain/plans.py` | PlanCard, PlanDetail, the For you feed, ranking order, `warm_reasons` |
| `domain/joins.py` | I'm in, withdraw, Your plans, group formation (`form`, `form_soon`) |
| `domain/meetups.py` | meetups (one per formed group) and the append-only step model |
| `domain/runner.py` | drives `ScriptedRun` for each meetup, pausing `demo.stepDelayS` between visible steps; intro message; `toMuse` turns |
| `domain/approvals.py` | approval state machine and the P11 money gate (`can_pay`, `pay`) |
| `domain/chat.py` | threads and messages; calls `on_to_muse` / `on_message` |
| `domain/nudges.py` | nudges from strong visible signals |
| `domain/people.py` | connections, profiles, reports, blocks |
| `domain/privacy.py` | every view of another person (P1 to P4, P9) |
| `domain/public.py` | `getPublicPlan` view |
| `domain/create_plan.py` | createPlan from free text or a share |
| `domain/shares.py` | anonymous meetup shares (public gallery) |
| `domain/verify.py` | in-person verification, check-in, feedback |
| `domain/prefs.py`, `domain/rewards.py` | learned preferences; private rewards |
| `domain/screen.py` | local word-list screen that always runs, fakes or not |
| `domain/matching.py`, `domain/stubs.py` | `World` to `cg_matching` adapter (rank cache, `form_groups`); naive stand-ins when `cg_matching` is missing |
| `domain/http.py` | route glue: live World, `Fail` to `ApiError`, spec example until a world is loaded, `warm()` |
| `routes/*.py` | public handlers ([table](#public-api-v1)) |
| `internal/*.py` | internal handlers ([table](#internal-api-internalv1)) |

## Public API (`/v1`)

Every request needs `X-CG-User: u_<id>` unless noted. "Fallthrough" means no handler: the OpenAPI example is returned.

| Method and path | operationId | Module | Purpose |
| --- | --- | --- | --- |
| GET `/v1/health` | getHealth | `routes/system.py` | `{status, muse: ok/fake, laya: ok/fake, demoMode, apiVersion: "2"}`; no header needed |
| GET `/v1/config` | getConfig | `routes/system.py` | features, limits (from `params.yaml`), modes (`available` only for loaded pools), live `demo` block |
| GET `/v1/me` | getMe | `routes/me.py` | own profile, hidden interests, Muse settings, rewards |
| PATCH `/v1/me` | updateMe | `routes/me.py` | profile and Muse settings |
| PUT `/v1/me/interests/{interestId}` | setInterestVisibility | `routes/me.py` | show or hide one interest |
| DELETE `/v1/me/interests/{interestId}` | removeInterest | `routes/me.py` | remove an interest |
| POST `/v1/optin` | optIn | `routes/setup.py` | join a pool (mode); idempotent |
| DELETE `/v1/optin` | optOut | `routes/setup.py` | leave the pool, withdraw joins, delete signals |
| GET `/v1/me/setup` | getSetup | `routes/setup.py` | what Muse picked up, for the setup review |
| POST `/v1/me/setup` | completeSetup | `routes/setup.py` | confirm interests and preferences; first feed built |
| GET `/v1/connectors` | listConnectors | `routes/connectors.py` | every connector and its state |
| POST `/v1/connectors/{provider}` | connectConnector | `routes/connectors.py` | activates the user's seeded records for that provider and re-derives; for `google_calendar` also pulls the linked live calendar (`refresh(force=True)`) |
| DELETE `/v1/connectors/{provider}` | disconnectConnector | `routes/connectors.py` | drops that provider's busy blocks, signals and evidence |
| GET `/v1/signals` | listSignals | `routes/connectors.py` | owner-only signals (P7) |
| PUT `/v1/signals/{signalId}` | setSignalVisibility | `routes/connectors.py` | show or hide a signal |
| DELETE `/v1/signals/{signalId}` | deleteSignal | `routes/connectors.py` | delete and never re-derive it |
| POST `/v1/calendar/sync` | syncCalendar | `routes/calendar.py` | device busy blocks in (start/end only), calendar directives out |
| POST `/v1/muse/ask` | askMuse | `routes/muse_bar.py` | the Muse bar; live Muse call with 8 s timeout, keyword fallback; 30 asks per hour, 500 chars |
| GET `/v1/feed` | getFeed | `routes/feed.py` | For you carousel; refreshes a linked Google Calendar (throttled) and warms reasons first |
| POST `/v1/plans` | createPlan | `routes/plans.py` | propose a plan in my words, or invite people I've met; waits for Muse's title up to 8 s |
| GET `/v1/plans/{planId}` | getPlan | `routes/plans.py` | the plan pop-up; refreshes a linked Google Calendar (throttled) |
| GET `/v1/public/plans/{planId}` | getPublicPlan | `routes/plans.py` | share-link view; **no header**, no person fields |
| POST `/v1/plans/{planId}/join` | joinPlan | `routes/joins.py` | I'm in; 409 full or closed, 429 above `openJoinsMax` (5) |
| DELETE `/v1/plans/{planId}/join` | withdrawJoin | `routes/joins.py` | silent withdraw before the group forms |
| GET `/v1/joins` | listJoins | `routes/joins.py` | Your plans list |
| GET `/v1/nudges` | listNudges | `routes/nudges.py` | proactive suggestions (`?surface=`) |
| POST `/v1/nudges/{nudgeId}/dismiss` | dismissNudge | `routes/nudges.py` | dismiss or mute |
| GET `/v1/meetups` | listMeetups | `routes/meetups.py` | my meetups, soonest first |
| GET `/v1/meetups/{meetupId}` | getMeetup | `routes/meetups.py` | steps, my approvals, attendees, booking, calendar, travel |
| POST `/v1/meetups/{meetupId}/leave` | leaveMeetup | `routes/meetups.py` | can't make it after formation |
| PUT `/v1/meetups/{meetupId}/my-status` | setMeetupStatus | **fallthrough** | "on my way" / "arrived"; returns the spec example for any meetup ID (perf-and-bugs "Open") |
| POST `/v1/meetups/{meetupId}/checkin` | checkIn | `routes/feedback.py` | check in during the window |
| POST `/v1/meetups/{meetupId}/feedback` | sendFeedback | `routes/feedback.py` | the three post-meetup questions |
| POST `/v1/meetups/{meetupId}/verify` | verifyAttendee | `routes/verify.py` | scanned or typed code; one scan verifies both people |
| POST `/v1/meetups/{meetupId}/share` | shareMeetup | `routes/shares.py` | anonymous share to the gallery |
| GET `/v1/shares` | listShares | `routes/shares.py` | public gallery; **no header** |
| PUT `/v1/shares/{shareId}/like` | likeShare | `routes/shares.py` | like or unlike |
| GET `/v1/approvals` | listApprovals | `routes/approvals.py` | my pending approvals |
| POST `/v1/approvals/{approvalId}/decision` | decideApproval | `routes/approvals.py` | approve or decline; decline runs the approval's `fallback` |
| GET `/v1/connections` | listConnections | `routes/people.py` | People you've met |
| GET `/v1/people/{userId}` | getPerson | `routes/people.py` | profile of someone I've been grouped with; 403 otherwise |
| GET `/v1/threads` | listThreads | `routes/chat.py` | my group chats |
| GET `/v1/threads/{threadId}` | getThread | `routes/chat.py` | one thread |
| GET `/v1/threads/{threadId}/messages` | listMessages | `routes/chat.py` | oldest first; `?after=<messageId>` |
| POST `/v1/threads/{threadId}/messages` | sendMessage | `routes/chat.py` | send; `clientId` makes retries idempotent; `toMuse` asks Muse to act |
| POST `/v1/threads/{threadId}/read` | markThreadRead | `routes/chat.py` | mark all read |
| POST `/v1/reports` | report | `routes/safety.py` | report a person |
| POST `/v1/blocks` | block | `routes/safety.py` | block a person (never grouped again) |
| GET `/v1/ws?user=<id>` | realtime | `routes/system.py` | WebSocket hints |
| GET `/static/{kind}/{name}` | (not in spec) | `routes/system.py` | seed avatars and venue photos; private users' avatars return 404 (#162) |

## Internal API (`/internal/v1`)

Loopback only, no identity header. Used by the dashboard, the sim, `cg-api-load-seed`, `scripts/e2e_flow.py` and the operator.

| Method and path | operationId | Module | Purpose |
| --- | --- | --- | --- |
| GET `/internal/v1/health` | internalHealth | `internal/pools.py` | `ok` once a pool is loaded, else `degraded` |
| GET `/internal/v1/pools` | listPools | `internal/pools.py` | every `modes.yaml` pool with opted-in member and synthetic counts |
| GET `/internal/v1/pools/{poolId}/export` | exportPool | `internal/pools.py` | full snapshot (exact homes, hidden and sensitive interests) for `cg_matching` and the sim (`schemas/pool_export.schema.json`) |
| GET `/internal/v1/pools/{poolId}/graph` | poolGraph | `internal/graph.py` | dashboard map: candidates and scenes (cached per pool + interest weights) |
| GET `/internal/v1/metrics?poolId=` | liveMetrics | `internal/graph.py` | dashboard counters |
| POST `/internal/v1/seed/load` | loadSeed | `internal/seed.py` | body `{poolId, reextract?}`; 202 with a job; loads in the background |
| GET `/internal/v1/jobs/{jobId}` | getJob | `internal/seed.py` | job status (`queued`, `running`, `done`, `failed`), progress |
| POST `/internal/v1/laya-tables/reload` | reloadLayaTables | `internal/pools.py` | re-read `data/laya_tables/<poolId>/manifest.json`; ignored with a warning if its `questionsVersion` differs from `params.laya.questionsVersion` |
| POST `/internal/v1/plans/regenerate` | regeneratePlans | **fallthrough** | spec example only |
| POST `/internal/v1/plans/{planId}/form` | formPlan | **fallthrough** | spec example only; in DEMO_MODE a plan forms by itself at `size.min` |
| POST `/internal/v1/demo/nudges` | triggerNudge | **fallthrough** | spec example only |
| GET `/internal/v1/demo` | getDemoState | `internal/demo.py` | current `DemoState` |
| PUT `/internal/v1/demo` | setDemoState | `internal/demo.py` | partial update of `counterpart` (`live`/`synthetic`), `liveUserId`, `forcedYes`, `relaxCheckin`, `failNextBooking`, `simulatedPayments`, `fakeLocation`; takes effect on the next action; emits `me.updated` to Maya and the live user |
| POST `/internal/v1/demo/reset` | resetDemo | `internal/demo.py` | restores the post-seed snapshot of the **last** seed load (every user); 204 |
| POST `/internal/v1/demo/meetups/{meetupId}/advance` | advanceMeetup | `internal/demo.py` | body `{to: leave_by / window_open / completed}`; time-travels the meetup, its thread title and its plan (#181, #191) |
| GET `/internal/v1/connectors/{provider}/link?userId=` | linkConnectorAccount | `internal/live_calendar.py` | laptop browser only: HTML page that redirects to Google's consent screen for that user |
| GET `/internal/v1/connectors/{provider}/callback` | connectorOAuthCallback | `internal/live_calendar.py` | OAuth redirect target: exchanges the code, stores the token, refreshes the user's calendar, shows an HTML result |

## Identity

`deps.current_user` accepts `X-CG-User` only if it matches `^u_[a-z0-9]+$` and the user is in the loaded store or the domain World; otherwise 401 `unauthenticated` ("Pick a demo user to continue."). The anonymous operations are `getHealth`, `getPublicPlan` and `listShares`. The WebSocket uses `?user=<id>` with the same rule and closes with code 1008 otherwise.

Seeded people are not opted in except the synthetic ones: `seed.new_user` sets `optedIn = setupComplete = synthetic`, so `u_maya` starts outside every pool and walks opt-in and setup in the app.

## Store and World

- One process, no locks, no persistence. `store` (`store/__init__.py`) holds users, records, activity, venues, plans, joins, meetups, threads, approvals, connections, blocks, nudges, reports, demo state and calendar directives.
- The domain `World` (`domain/world.py`) owns plans, joins, meetups, threads, approvals, connections, blocks, reports, venues and nudges. The store **aliases the same objects** (`store/bridge.py`, `SHARED`). Users, interests, signals and busy blocks stay with the store and are projected into the World by `bridge.sync(uid)` after every change.
- `store.snapshot()` deep-copies the state after a seed load. `resetDemo` restores it (one deepcopy, so aliasing survives) and resets live IDs (`<prefix>_l0001`…).
- Live IDs carry an `l` after the prefix, so they never collide with seed IDs.
- `store.counters` (process lifetime, not reset) feed `/internal/v1/metrics`.

## Seed loading and the primary pool

`seed.load(pool_id)` (`seed/__init__.py`) always rebuilds a fresh world containing **every** pool in `contracts/modes.yaml` that has a seed (`data/seed/<pool>/pool.json`, or the tiny seed if it names that pool). Today that is `pool_sf_city` and `pool_evt_closer_together`.

- Load order is `[pool_id, then the other seeded pools]`. The argument is the **primary** pool: `store.pool`, `store.demo` (its `demo.json`: `mayaId`, `featuredPlanIds`, `heroPlanId`, `nudgePlanId`, `liveUserId`, `fakeLocation`) and the default `DemoState` come from it.
- A person who appears in two pools is created from the first pool loaded ("Maya lives in her first pool; optIn moves her").
- Colliding venue or plan IDs from a later pool are renamed `<id>_<pool suffix>` and every reference is rewritten (`_dedupe_ids`).
- Seed files are schema-validated (`pool`, `demo`, `personas`, `activity`, `connectors`, `venues`, `plans`); any bad row fails the load.
- For each synthetic person, their seeded connectors are connected and `derive(uid)` runs: busy blocks from connector records, rule signals (`frequent_place`, `saved_place`, `routine`, `ticket`, anchored to the demo clock 2026-11-13 12:00 PT), and extraction through `ports.extractor`. Extraction results are cached in `services/api/.cache/extract/` keyed by content hash and salted with the extractor mode and version, so fake and live results never mix. `reextract: true` bypasses the cache.
- Seeded `seedJoinIds` become `interested` joins.
- `_maybe_tables(pid)` points the store at `data/laya_tables/<pid>/` when present.
- Then `bridge.build()`, `store.snapshot()`.

Consequence for the demo: **the last `loadSeed` call decides whose `demo.json` drives the demo.** Loading `pool_evt_closer_together` after `pool_sf_city` makes the event pool primary, and Maya's pinned feed then starts with `pl_evt_hero_lunch_walk` instead of `pl_sf_hero_wheel`. The process already loads SF as primary at startup, so the demo needs no seed command at all; to reload, load only `pool_sf_city` (the event pool still comes along for the mode switch). See the [runbook](runbook.md#4-seed).

Timing: `services/api/STATUS.md` records 1.3 s for the SF seed (301 people) with stub extraction (2026-11-12); `resetDemo` took 47 ms. The job is asynchronous, so poll `getJob` (or use `cg-api-load-seed`, which does).

## DEMO_MODE behaviour

`DEMO_MODE=1` is mandatory: `create_apps()` exits without it because v2 has no real authentication. With it on:

| Behaviour | Where | Detail |
| --- | --- | --- |
| Demo identity | `deps.current_user` | `X-CG-User` header is the only identity |
| Pinned featured feed | `domain/plans.py` | `feed.demoPinFeatured`: the primary pool's `featuredPlanIds` lead Maya's first feed, in order (they skip the travel filter by design) |
| Gathering beat | `domain/joins.form_soon` | `plans.demoFormAtMin`: once `size.min` people joined, the plan forms after a random `demo.syntheticDelayS` (2 to 5 s) so "Muse is gathering people" is visible on stage; it re-checks that enough people are still in before forming. A full plan forms immediately |
| Step pacing | `domain/runner._delay` | `demo.stepDelayS` (1 to 2 s) between visible Muse steps |
| Synthetic approvals | `synthetic.on_approval` | every new approval for a synthetic person is answered after `demo.syntheticDelayS` through `approvals.decide`, so P11 still holds. `forcedYes` (default true) always approves; otherwise a deterministic 80% yes per approval ID |
| Synthetic chat replies (#160) | `synthetic.on_message` | when a person posts a plain (non-`toMuse`) message in a group thread, one synthetic member (chosen by message-ID hash, excluding the sender and anyone who left) replies after `demo.syntheticDelayS` with one of six `CHAT_LINES`, picked by message-ID hash. Replies go through `chat.post`, so counterparts never answer each other |
| Live counterpart | `synthetic.acts_for` | with `counterpart: live`, the `liveUserId` (default `u_0098`, the second phone) is never answered for |
| Demo controls | `internal/demo.py` | `setDemoState`, `resetDemo`, `advanceMeetup` |

Why the chat lines are templated: real Muse refuses to speak as a person ("I'm Muse Spark, an AI…") and took 8 to 22 s for this call, past the 8 s timeout (PR #160; comment above `CHAT_LINES`). A typing indicator for these replies (`thread.typing`) was proposed in contracts PR #205 and **closed unmerged**; no such event exists.

`params.demo` (`contracts/params.yaml`): `syntheticDelayS [2, 5]`, `stepDelayS [1, 2]`, `forcedYesDefault true`, `relaxCheckinDefault true`, `counterpartDefault synthetic`, `simulatedPayments true`.

## Muse off the request path

Muse (`muse-spark-1.3` at `https://api.meta.ai/v1`, OpenAI-compatible Responses API) takes about 10 s per call and sheds load with 503s, so the request path avoids waiting on it.

- **Copy that never waits** (`MuseCopy` in `muse/copy.py`): feed and plan reasons, titles, setup review and nudges return the template at once and queue a background fill (3 concurrent, 3 attempts, backoff capped at 5 s, 30 s per fill; a failed key is not retried for 60 s). Later requests get Muse's text from the cache, which is persisted to `services/api/.cache/muse_copy.json` (gitignored) after each answer. With `MUSE_FAKE=1` there is no cache file.
- **Nudges** (#175): in DEMO_MODE a new nudge stays unseen until Muse's fill lands, then its copy is frozen, so it never flips between template and Muse text.
- **Calls that do wait, up to `params.muse.liveTimeoutS` (8 s):** the meetup intro and starters (in the runner's background driver, not a request), `plan_title` for `createPlan`, and the Muse bar (`askMuse`). A timeout falls back to the template or the keyword reply.
- **Extraction** does not call Muse (`inline_muse=False`, extractor `cache_version` 3): keywords, taxonomy and Laya only.
- **`cg-api-precompute-muse <poolId>`** loads the seed in its own process, walks the demo users (`mayaId`, `liveUserId`) through opt-in, setup, every simulated connector, feed, every feed plan, nudges and every ranked plan, then waits for all fills and prints `done: N cached (M new), K failed`. Exit 1 if any failed; it is resumable, so run it again. The running server reads `muse_copy.json` only when it starts, so restart it to start warm.

Details of prompts and voice: [muse.md](muse.md).

## Laya client

`LayaClient` (`laya/__init__.py`) posts `{"model": LAYA_MODEL, "state": <rendered text>, "questions": {<name>: {type, instructions, criteria?}}}` to `LAYA_URL/v1/systemone` with a 5 s timeout.

- Answers are parsed by `_parse_answer`: scalar fields `noul`, `p`, `probability`, `yes`, `value`, `expected` (first numeric wins; laya-serve 0.2.1 sends `{"noul": p}`), or a distribution under `probabilities`/`distribution` (index-keyed for `score` questions). Verified against laya-serve 0.2.1 on 2026-11-13 (#130).
- Results are cached in memory by `(questionsVersion, question, sha256(state))`. `is_decisive` uses `params.laya.decisiveThreshold`.
- Any failure raises `LayaUnavailable`; above 5% failures it logs `laya fallbacks above 5%` (check the answer-field adapter).
- `LAYA_FAKE=1` uses a SHA-256 hash of the state as p. It is not a judgement, so the extractor fails closed on undecided answers only when both Muse and Laya are live.
- Live calls on the request path: `plan_ok` in `createPlan` and share captions. At seed load and connector changes: `sensitive_interest` and `interest_strength` in extraction.
- Laya tables (`data/laya_tables/<pool>/`, written by `cg-sim precompute`) are validated and registered by `reloadLayaTables` / seed load (`store.laya_tables_dir`). Real tables exist for `pool_sf_city` (`layaModel: "laya"`). See the note under [Known code gaps](#known-code-gaps-not-fixed-code-is-frozen) on how the live ranking uses them.

Questions, tables and sim usage: [laya.md](laya.md).

## Live Google Calendar (#137)

Off unless `CONNECTORS_LIVE=1` **and** `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set (`live_calendar.enabled()`). Only free/busy is read (scope `https://www.googleapis.com/auth/calendar.freebusy`). Every other connector stays simulated from seeded records.

1. **Link (laptop only).** Open `http://127.0.0.1:9001/internal/v1/connectors/google_calendar/link?userId=u_maya`. The page meta-refreshes to Google's consent screen with a one-time `state` (valid 600 s), `access_type=offline` and `prompt=consent` (so a refresh token always comes back). Unknown provider, live mode off, or unknown user: 404.
2. **Callback.** Google redirects to `http://<CG_INTERNAL_HOST>:<CG_INTERNAL_PORT>/internal/v1/connectors/google_calendar/callback`, which must be registered exactly in the Google OAuth client. The code is exchanged for tokens; the token file is written to `services/api/.cache/tokens/google_calendar/<userId>.json` with mode 0600 (gitignored with `services/api/.cache/`). It never reaches a client. Then `refresh(uid, force=True)` runs and the page says how many busy blocks it is using, or tells you to turn on Google Calendar in the app.
3. **Use.** When the user is opted in and has `google_calendar` connected, `apply()` fetches free/busy for the primary calendar over `calendar.horizonDays` (14) and **replaces** the seeded `google_calendar` records with `cr_live_…` busy records, re-derives busy blocks, and, if they changed, emits `me.updated` so the rank cache drops plans that now clash.
4. **Refresh.** `getFeed` and `getPlan` call `refresh(uid)`, throttled to once per `calendar.liveRefreshMinS` (60 s) per user. `connectConnector google_calendar` and the callback force it.
5. **Failure** never raises: a failed fetch keeps the current records (seeded, or the last good live data). An expired refresh token (`invalid_grant`, 7 days in Google's Testing mode) logs `token refresh failed … link the account again`.

## Realtime

`realtime.emit(user_id, type, data)` sends `{type, eventId, at, data}` to that user's sockets (single process, fire-and-forget; `World.emit` forwards to it). Clients also poll (`client.pollIntervalS` 5 s, `feedRefreshS` 60 s, from `/v1/config`) because events are hints and REST is the truth (CONTRACTS §3, §6). The server answers `{"type": "pong"}` to `{"type": "ping"}`; any other client frame is ignored.

## Error envelope

`{"error": {"code", "message", "retryable", "details"?}}` (`errors.py`). Status to code: 400 `validation_failed`, 401 `unauthenticated`, 403 `not_allowed` / `not_opted_in`, 404 `not_found`, 409 `conflict`, 422 `screened`, 429 `rate_limited`, 503 `unavailable` (`muse_unavailable`, `laya_unavailable`), unhandled 500 `internal` (`retryable: true`). Messages are final user copy; validators raise `errors.UserMessage` to set the 400 text.

## Privacy P1 to P11 (CONTRACTS §8)

| Rule | Where enforced | Tests |
| --- | --- | --- |
| P1 overlap only, P2 two-stage reveal, P4 sensitive | `domain/privacy.py` (`_allowed`, `shared_full`, `crowd` re-checks every interest the matcher returns); `cg_matching.shared_interests` / `plan_overlap` filter first; `stubs._usable` honours per-user `sensitive` (#163) | `tests/privacy/test_privacy.py` `test_p1_*`, `test_p2_*`, `test_p4_*` |
| P3 private profiles | `privacy.person_card` (first name, no avatar); `/static/avatars` 404 for private users (#162) | `test_p3_private_profile` |
| P5 no enumeration, P6 invisible outcomes | no list or search endpoint; `withdrawJoin` is silent; the runner posts only "can't make this one" | `test_p5_*`, `test_p6_*` |
| P7 owner-only signals | `store/views.py` | `test_p7_owner_only` |
| P8 no location tracking | no location endpoint; travel from the neighborhood centroid | `test_p8_centroid_and_directions` |
| P9 internal surface | separate app, loopback bind check, loopback Host/Origin middleware (#167); blocked users filtered by `privacy.others_visible` | `test_p9_blocked_disappear_and_never_grouped`; `tests/platform/test_guard.py` |
| P10 data stays home | only Muse, Laya and (when enabled) Google free/busy make outbound calls; booking and payments are simulated in-process | `tests/ai/test_prompt_privacy.py` |
| P11 money and actions | `domain/approvals.py`: a payment needs an approved `payment` approval or an amount within `spendWithoutAskingCents` | `tests/domain/test_core_loop.py`, `tests/domain/test_runner.py`, `tests/agent/test_scripted.py` |

The P10 and P11 test files above pass on `main` (45 tests, run for this page).

## Environment variables

Read by `cg_api/settings.py` (except where noted). Never commit values; `.env` and `facebook-clone/.env` are gitignored.

| Variable | Default in code | Demo value | Meaning |
| --- | --- | --- | --- |
| `DEMO_MODE` | `1` | `1` | must be `1` or the server exits |
| `MUSE_FAKE` | `0` | `0` | `1` = every Muse call raises, templates everywhere, no copy cache |
| `MODEL_API_KEY` | empty | from `.env` | bearer key for Muse |
| `MUSE_BASE_URL` | `https://api.meta.ai/v1` | same | Muse endpoint |
| `MUSE_MODEL` | `muse-spark-1.3` | same | checked against `/models` at startup |
| `LAYA_FAKE` | `0` | `0` | `1` = hash fake |
| `LAYA_URL` | `http://127.0.0.1:8090` | same | laya-serve base URL |
| `LAYA_MODEL` | `laya` | `laya` | model name sent to laya-serve |
| `CG_API_HOST` / `CG_API_PORT` | `0.0.0.0` / `8000` | same | public listener |
| `CG_INTERNAL_HOST` / `CG_INTERNAL_PORT` | `127.0.0.1` / `9001` | same | internal listener; host must be loopback; also used by `cg-api-load-seed` and the OAuth redirect URI |
| `CG_DATA_DIR` | `<repo>/data` | absolute path | seeds, Laya tables. `.env.example` sets `./data`, which is relative to the **current directory**, so pass an absolute path when running from `services/api` |
| `CG_CONTRACTS_DIR` | `<repo>/contracts` | absolute path | same caveat |
| `CONNECTORS_LIVE` | `0` | `1` | enables live Google Calendar |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | empty | from `.env` | Google OAuth client (Web application) |
| `DATABASE_URL` | empty | empty | read, unused (in-memory only) |
| `CG_INTERNAL_URL` | (sim, dashboard, `e2e_flow.py`) | `http://127.0.0.1:9001` | where they reach the internal API |
| `CG_API_URL` | (`e2e_flow.py`) | `http://127.0.0.1:8000` | public API for the e2e script |
| `CG_DASHBOARD_HOST` / `CG_DASHBOARD_PORT` | (dashboard) | `127.0.0.1` / `9100` | dashboard |
| `EXPO_PUBLIC_CG_API_URL`, `EXPO_PUBLIC_CG_USER`, `EXPO_PUBLIC_CG_MOCK` | (app, `facebook-clone/.env`) | `http://<LAN IP>:8000`, `u_maya`, `0` | baked into the JS bundle by Metro |

## Performance

From the adversarial track ([perf-and-bugs.md](perf-and-bugs.md)); numbers are from the PRs on cloned pools.

| PR | Change | Before → after |
| --- | --- | --- |
| #156 | `cg_matching.form_groups` keeps each waiting person's running min pair score; queue position from a dict | 600 users: 579 → 141 ms (400: 222 → 63); outputs identical |
| #158 | `candidates` computes each user's vector norm once | 600 users (sf_city): 428 → 231 ms (400: 188 → 102); outputs identical |
| #169 | feed overlap exports only the compared users | `plans.feed` with 4000 connections: 120.5 → 4.9 ms |
| #170 | internal export, graph and metrics index pairs once | 4000 connections: export 100 → 5 ms, graph 48 → 4, metrics 39 → 0.3 |
| #171 | rank cache keyed on a version counter, bumped by profile, setup, connector, calendar and block changes | chat-only events no longer re-rank the pool; profile edits no longer leave a stale feed |

Remaining: `rank_plans` (~100 ms over the pool) still runs on the event loop when the rank cache misses; formation reruns `candidates` (~180 ms) once per formed plan. Perf guard: `tests/perf/test_budgets.py`.

## Backend fixes merged #154 to #204

| PR | Fix |
| --- | --- |
| #160 | synthetic counterparts reply in the group chat (templated) |
| #162 | P3: private users' avatars no longer served from `/static` |
| #163 | P4: stubs overlap drops Laya-flagged interests that weren't opted in |
| #164 | `LayaTables` rejects non-finite probabilities |
| #167 | P9: internal API rejects non-loopback Host/Origin |
| #169, #170, #171 | perf and stale-feed fixes above |
| #175 | nudge copy stable per nudge; a nudge disappears when its signal is hidden or deleted |
| #181 | `advanceMeetup completed` shifts by whole days and keeps the title's weekday true |
| #191 | `advanceMeetup` moves the plan with its meetup |
| #192 | plan descriptions describe the activity (createPlan and tiny seed) |

Everything else in that range was app, shell, sim or docs.

## Known code gaps (not fixed; code is frozen)

- **Live ranking does not read the Laya tables.** `domain/matching.py` passes an empty `cgm.LayaTables()` to `rank_plans` and `form_groups`, so `p_join`, `p_show` and `meet_again` use the 0.5 default. `store.laya_tables_dir` is set by seed load and `reloadLayaTables` but nothing reads it. The real tables drive the sim, not the live feed.
- **`laya_tables_dir` is last-pool-wins.** Seed load calls `load_tables` for every pool in order, so with tables for both pools the pointer would end on the non-primary pool. Today only `pool_sf_city` has tables, so it points there.
- **Four operations are example fallthroughs:** `setMeetupStatus`, `regeneratePlans`, `formPlan`, `triggerNudge`. `setMeetupStatus` answers 200 with example data for any meetup ID.
- **`askMuse` waits up to 8 s** on Muse (about 10 s typical), so it often times out and returns the keyword reply; the app gives it 30 s.

## Run and test

```sh
cd services/api && uv run cg-api                          # or: make api (does not load .env)
cd services/api && uv run cg-api-load-seed pool_sf_city   # or: make seed POOL=pool_sf_city
cd services/api && uv run cg-api-precompute-muse pool_sf_city
cd services/api && uv run --frozen pytest -q              # 377 passed on main at #204
python scripts/validate_contracts.py && python scripts/build_openapi_json.py --check   # make contracts-check
python3 scripts/e2e_flow.py --reset                       # full demo flow through the API (resets every user)
```

Tests force `MUSE_FAKE=1 LAYA_FAKE=1` and the tiny built-in seed (`tests/conftest.py`). The full demo bring-up is in [runbook.md](runbook.md).
