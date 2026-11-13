# backend status
Milestone: slice A M2 (platform) done

## Done
- 2026-11-12 M0 scaffold: two listeners (public 0.0.0.0:8000, internal 127.0.0.1:9001) in one process; refuses to start without DEMO_MODE=1; `X-CG-User` identity (401 envelope); every public and internal operation answers with its openapi example, or one synthesised from the schema for the 19 public + 15 internal operations without an inline example (contract v2.0.0).
- `getHealth`, `getConfig` (built from params.yaml + modes.yaml), `/v1/ws` (accept + pong only) are real.
- Contract tests validate every response against both OpenAPI files; P9 test (no internal path on the public listener).
- 2026-11-12 M1 slice A: in-memory store, seed load (schema-validated, background job, `cg-api-load-seed`), tiny built-in seed (`cg_api/seed/tiny`, used when `data/seed/<pool>` is absent), static avatars and venue photos (`/static/avatars|venues/<file>`), `getMe`, `updateMe`, `setInterestVisibility`, `removeInterest`, `optIn`, `optOut`, `getSetup`, `completeSetup`, `listConnectors`, `connectConnector`, `disconnectConnector`, `listSignals`, `setSignalVisibility`, `deleteSignal`, `syncCalendar`, `internalHealth`, `listPools`, `exportPool` (validates against pool_export.schema.json on the real sim seed), `loadSeed`, `getJob`, `reloadLayaTables`, `resetDemo`. Realtime hub (`cg_api.realtime.emit`) pushes to `/v1/ws`.
- Real seed (cg-sim pool_sf_city: 301 people, 80 venues, 92 plans) loads in about 1 s with stub extraction; reset in 0.04 s.

- 2026-11-12 Slice A M2: `getDemoState`/`setDemoState` (`config.demo` follows it live), `advanceMeetup` (leave_by, window_open, completed), `poolGraph` (cg_matching candidates + Leiden scenes; group/met/friendship edges), `liveMetrics`.
- 2026-11-12 Store and slice C's domain World are one world (`cg_api/store/bridge.py`), checked end to end against #16 in `tests/platform/test_bridge.py`, which skips until `cg_api.domain` is on the branch.
- 2026-11-12 Real seed (data/seed/pool_sf_city, 301 people), stub extraction: load 1.3 s; p95 getMe 3 ms, getSetup 5 ms, export 34 ms, graph 55 ms (first call, then cached), metrics 2 ms, reset 47 ms.

- 2026-11-12 Perf guard `tests/perf/test_budgets.py` writes the real city seed scaled to 400 people and 600 plans as a seed dir and loads it for real: load 1.7 s, reset 0.09 s; p95 over 20 samples (2xx checked): getMe 4 ms, export 113 ms, graph 7 ms, the rest ≤ 3 ms (stub extraction). Asserts load < 60 s, reset < 10 s, GET p95 < 300 ms.

## Decisions
- 2026-11-12 `Me.unlocks` and `Me.capabilities` come from `store.views.earned_unlocks` (counted meetups vs `params.unlocks`). C's `domain/create_plan.can_create` applies the same `create_plans` rule on its own World. If you change the rule, change both (or switch C to call `earned_unlocks`).
- 2026-11-12 `Me.rewards` comes from `cg_api.domain.rewards` and appears only in the user's own `Me`. It counts meetups where `meetups[mt]["members"][uid]["counted"] is True`, plus `params.unlocks`; reports against the user (`store.reports[*].userId`) block the `requiresNoReports` unlock.
- 2026-11-12 `cg-api` refuses to start unless `CG_INTERNAL_HOST` is loopback (127.0.0.1/::1/localhost), P9.
- 2026-11-12 FastAPI + uvicorn, two `uvicorn.Server`s under one asyncio loop (`cg-api`).
- 2026-11-12 Route auto-discovery: any module in `cg_api/routes/` (public) or `cg_api/internal/` (internal) exposing `router = APIRouter()` is mounted. Set `operation_id=<spec operationId>` on each route; operations without a handler fall through to the spec example (logged as `example fallthrough`). `app.py` is frozen after M0.
- 2026-11-12 Ports (`cg_api/ports.py`): `Muse`, `Laya`, `Extractor`, `Copy`, `AgentRunner` Protocols on `cg_api.ports.ports`; stubs by default (StubMuse raises `Unavailable` so callers run their D4 fallback). Slice D installs real ones via `cg_api.providers.install(ports)`.
- 2026-11-12 `cg_matching` 0.2.0 (slice B, `packages/matching`, merged #13) is a uv path dependency, pinned in `uv.lock`; imported lazily through `ports.matching()` (raises `Unavailable` if missing).
- 2026-11-12 World access: `cg_api.deps.get_world()` / `deps.World` (FastAPI dependency) return the single `cg_api.store.Store` instance. Its field layout is documented in `cg_api/store/__init__.py`; live IDs come from `store.new_id(prefix)`.
- 2026-11-12 Identity: unknown `X-CG-User` (not in the loaded seed) → 401. P3 helpers for every slice: `store.views.display_name`, `store.views.avatar_url`.
- 2026-11-12 Rule-based signals (frequent_place, saved_place, routine, ticket) and busy blocks are slice A (`cg_api.seed`). Interests and model signals come from `ports.extractor` (slice D), cached in `services/api/.cache/extract/`. Rule signals carry no `interestIds` yet.
- 2026-11-12 Signal and visit windows use a fixed demo clock (`seed.ANCHOR` = 2026-11-13T12:00-08:00, CONTRACTS Decisions), so reloads are deterministic (D2).
- 2026-11-12 Sensitive interests a user accepts are shown on their profile but never opted into overlap (`sharedSensitiveOptIn` stays false; no API sets it yet, P4).
- 2026-11-12 Every seeded pool loads side by side (`seed.load(primary)`): one world, users carry `poolId`, and plans carry `poolId` from the seed. `loadSeed(poolId)` sets the primary pool, whose demo.json drives demo state; per-pool demo.json lives in `store.demos[poolId]`. `optIn` switches Maya between pools live (city ↔ event, demo 4:15) and keeps people met and threads. `config.modes` marks a built pool without a loaded seed `available: false`.
- 2026-11-12 The seeds reuse 13 venue IDs and 12 plan IDs across pools, with different places. The loader renames the second pool's colliding IDs to `<id>_<pool suffix>` and rewrites every reference (plans, connector records, demo.json), with a warning in the log.
- 2026-11-12 Profile updates are validated completely (pydantic, including group size min ≤ max) before any field is written, so a rejected `updateMe` or `completeSetup` changes nothing. Validators raise `errors.UserMessage("...")` to set the 400 message as final copy (otherwise it's generic).
- 2026-11-12 Directives: `syncCalendar` derives them live from the domain (`domain.joins.hold` for each of the user's joins, `domain.meetups.directive` for each meetup they're in), plus any explicit `store.directives[uid][key]` write. `none` is sent only while the device still reports that key applied as hold or event. Applied state is in `store.applied[uid][key]`.
- 2026-11-12 Branch tracks origin/main (v2 contracts #12, Decisions #15 merged in).
- 2026-11-12 `/v1/ws` applies the REST identity rule to `?user=` (close 1008 otherwise) and ignores non-object frames.

- 2026-11-12 `ports.extractor.venue` is a venue-ID lookup into the loaded seed (`store.venues.get`): the stub default and `seed.load` both bind it, so the sensitive-venue check never fails open (P4).

- 2026-11-12 Bridge: the domain World (`cg_api.domain.world.current`) owns plans, joins, meetups, threads, approvals, connections (frozenset pair keys), blocks and reports; the store aliases the same objects. A owns users, interests, signals and busy blocks, and `bridge.sync(uid)` / `bridge.changed(uid, *events)` project them into the World after every A change. `World.emit` is forwarded to `cg_api.realtime`. Reset deep-copies store and World together, so the aliases survive.
- 2026-11-12 `ports.CopyInterest` = `{id, label, visibility, sensitive}`. `Copy.plan_reason(plan, shared)`, `Copy.setup_review(uid, interests)` and `Copy.intro(first_names, shared, plan)` take `list[CopyInterest]`, and Copy drops sensitive and hidden ones itself (`ports.safe_labels`). `Copy.nudge` returns `(title, text)`.
- 2026-11-12 Demo state lives in `store.demo_state` (DemoState shape); slices read it, e.g. `store.demo_state["failNextBooking"]` (whoever consumes it sets it back to False).
- 2026-11-12 Producer-only metric counts: increment `cg_api.store.counters` with `muse_fallbacks`, `laya_calls`, `laya_decisive` and `booking_fallbacks`.

## Needs
- needs: slice C — `joins.hold` and `meetups.directive` add " at {venue}" even when the plan title already names the venue ("Weekend brunch at Nopal Table at Nopal Table"). `syncCalendar` trims it for now (`routes/calendar._tidy`).
- needs: slice C/D (optional) — mark Muse's `calendar` step done per attendee from `store.applied[uid][meetupId] == "event"` (CONTRACTS §5) instead of marking it done right away.
- needs: slice C — set `meetups[mt]["members"][uid]["counted"] = True` when the trust rule passes (`params.checkin.meetupCountsWhen`); `Me.rewards` reads it.
- needs: bplans — clean `ruff check` errors in domain/joins.py, plans.py, runner.py, world.py and routes/approvals.py.
- needs: sim — make venue and plan IDs unique across pools (e.g. `vn_crux_collective` is in both seeds at different locations). The backend renames them for now.
- needs: slice C — filter feed and plan inventory by the viewer's `poolId` (`plan["poolId"]`), and take featured plans from `store.demos[user poolId]` instead of `World.demo` (the primary pool only).

## Known gaps
- `regeneratePlans`, `triggerNudge`, `formPlan` are slice C (example fallthrough until #16).
- Stub extractor returns no interests, so feeds are thin until slice D's fake extraction lands.
- Synthesised examples use placeholder strings (`"x"`) for free-text and unpatterned IDs; they validate but are not realistic.
