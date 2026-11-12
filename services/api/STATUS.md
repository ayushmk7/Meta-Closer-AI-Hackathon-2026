# backend status
Milestone: M0 skeleton (done), M1 slice A next

## Done
- 2026-11-12 M0 scaffold: two listeners (public 0.0.0.0:8000, internal 127.0.0.1:9001) in one process; refuses to start without DEMO_MODE=1; `X-CG-User` identity (401 envelope); every public and internal operation answers with its openapi example, or one synthesised from the schema for the 19 public + 15 internal operations without an inline example (contract v2.0.0).
- `getHealth`, `getConfig` (built from params.yaml + modes.yaml), `/v1/ws` (accept + pong only) are real.
- Contract tests validate every response against both OpenAPI files; P9 test (no internal path on the public listener).

## Decisions
- 2026-11-12 FastAPI + uvicorn, two `uvicorn.Server`s under one asyncio loop (`cg-api`).
- 2026-11-12 Route auto-discovery: any module in `cg_api/routes/` (public) or `cg_api/internal/` (internal) exposing `router = APIRouter()` is mounted. Set `operation_id=<spec operationId>` on each route; operations without a handler fall through to the spec example (logged as `example fallthrough`). `app.py` is frozen after M0.
- 2026-11-12 Ports (`cg_api/ports.py`): `Muse`, `Laya`, `Extractor`, `Copy`, `AgentRunner` Protocols on `cg_api.ports.ports`; stubs by default (StubMuse raises `Unavailable` so callers run their D4 fallback). Slice D installs real ones via `cg_api.providers.install(ports)`.
- 2026-11-12 `cg_matching` 0.2.0 (slice B, `packages/matching`, merged #13) is a uv path dependency, pinned in `uv.lock`; imported lazily through `ports.matching()` (raises `Unavailable` if missing).
- 2026-11-12 Branch tracks origin/main (v2 contracts #12, Decisions #15 merged in).
- 2026-11-12 `/v1/ws` applies the REST identity rule to `?user=` (close 1008 otherwise) and ignores non-object frames.

## Needs

## Known gaps
- Synthesised examples use placeholder strings (`"x"`) for free-text and unpatterned IDs; they validate but are not realistic.
- No store yet: any well-formed `u_` id is accepted until the seed loads (M1).
