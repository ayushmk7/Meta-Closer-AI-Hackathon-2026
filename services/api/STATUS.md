# backend status
Milestone: M1 slice A (platform) done; C/D handlers pending

## Done
- 2026-11-12 M0 scaffold: two listeners (public 0.0.0.0:8000, internal 127.0.0.1:9001) in one process; refuses to start without DEMO_MODE=1; `X-CG-User` identity (401 envelope); every public and internal operation answers with its openapi example, or one synthesised from the schema for the 19 public + 15 internal operations without an inline example (contract v2.0.0).
- `getHealth`, `getConfig` (built from params.yaml + modes.yaml), `/v1/ws` (accept + pong only) are real.
- Contract tests validate every response against both OpenAPI files; P9 test (no internal path on the public listener).
- 2026-11-12 M1 slice A: in-memory store, seed load (schema-validated, background job, `cg-api-load-seed`), tiny built-in seed (`cg_api/seed/tiny`, used when `data/seed/<pool>` is absent), static avatars and venue photos (`/static/avatars|venues/<file>`), `getMe`, `updateMe`, `setInterestVisibility`, `removeInterest`, `optIn`, `optOut`, `getSetup`, `completeSetup`, `listConnectors`, `connectConnector`, `disconnectConnector`, `listSignals`, `setSignalVisibility`, `deleteSignal`, `syncCalendar`, `internalHealth`, `listPools`, `exportPool` (validates against pool_export.schema.json on the real sim seed), `loadSeed`, `getJob`, `reloadLayaTables`, `resetDemo`. Realtime hub (`cg_api.realtime.emit`) pushes to `/v1/ws`.
- Real seed (cg-sim pool_sf_city: 301 people, 80 venues, 92 plans) loads in about 1 s with stub extraction; reset in 0.04 s.

## Decisions
- 2026-11-12 FastAPI + uvicorn, two `uvicorn.Server`s under one asyncio loop (`cg-api`).
- 2026-11-12 Route auto-discovery: any module in `cg_api/routes/` (public) or `cg_api/internal/` (internal) exposing `router = APIRouter()` is mounted. Set `operation_id=<spec operationId>` on each route; operations without a handler fall through to the spec example (logged as `example fallthrough`). `app.py` is frozen after M0.
- 2026-11-12 Ports (`cg_api/ports.py`): `Muse`, `Laya`, `Extractor`, `Copy`, `AgentRunner` Protocols on `cg_api.ports.ports`; stubs by default (StubMuse raises `Unavailable` so callers run their D4 fallback). Slice D installs real ones via `cg_api.providers.install(ports)`.
- 2026-11-12 `cg_matching` (slice B, `packages/matching`) is an optional extra (`uv sync --extra matching`) via a uv path source, imported lazily through `ports.matching()` (raises `Unavailable` when absent). Becomes a hard dependency once B lands on the base. The lock was generated against a placeholder `cg-matching` with deps numpy, pyarrow, pyyaml, igraph, leidenalg.
- 2026-11-12 World access: `cg_api.deps.get_world()` / `deps.World` (FastAPI dependency) return the single `cg_api.store.Store` instance. Its field layout is documented in `cg_api/store/__init__.py`; live IDs come from `store.new_id(prefix)`.
- 2026-11-12 Identity: unknown `X-CG-User` (not in the loaded seed) → 401. P3 helpers for every slice: `store.views.display_name`, `store.views.avatar_url`.
- 2026-11-12 Rule-based signals (frequent_place, saved_place, routine, ticket) and busy blocks are slice A (`cg_api.seed`). Interests and model signals come from `ports.extractor` (slice D), cached in `services/api/.cache/extract/`. Rule signals carry no `interestIds` yet.
- 2026-11-12 Signal and visit windows use a fixed demo clock (`seed.ANCHOR` = 2026-11-13T12:00-08:00, CONTRACTS Decisions), so reloads are deterministic (D2).
- 2026-11-12 Sensitive interests a user accepts are shown on their profile but never opted into overlap (`sharedSensitiveOptIn` stays false; no API sets it yet, P4).
- 2026-11-12 One pool loaded at a time; `optIn` into an unloaded pool → 409. Live pool switching comes in M2.
- 2026-11-12 Directives: other slices write `store.directives[uid][key]`; `syncCalendar` returns them all and records `store.applied[uid][key]` for ok reports.
- 2026-11-12 Branch tracks origin/main (v2 contracts #12, Decisions #15 merged in).
- 2026-11-12 `/v1/ws` applies the REST identity rule to `?user=` (close 1008 otherwise) and ignores non-object frames.

- 2026-11-12 `ports.extractor.venue` is set at seed load to a venue-ID lookup (`store.venues.get`), for the extractor's sensitive-venue check.

## Needs
- needs: slice B — `packages/matching/pyproject.toml` named `cg-matching`, deps within numpy/pyarrow/pyyaml/igraph/leidenalg (else A re-locks services/api).
- needs: merge order #13 (packages/matching) then this; A then merges main and re-locks so cg-matching is pinned. Until then plain `uv run` (no `--frozen`) fails to resolve the missing path dep; use `uv run --frozen`.
- needs: human — merge `cg/sim/m0-seed-v2` to main (v2 contracts merged in #12, #15).

## Known gaps
- `getDemoState`, `setDemoState`, `advanceMeetup`, `poolGraph`, `liveMetrics`, `regeneratePlans`, `triggerNudge`, `formPlan` are still example fallthrough (M2, or slice C).
- Stub extractor returns no interests, so feeds are thin until slice D's fake extraction lands.
- Synthesised examples use placeholder strings (`"x"`) for free-text and unpatterned IDs; they validate but are not realistic.
