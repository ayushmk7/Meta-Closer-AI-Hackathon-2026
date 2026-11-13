# Backend (`services/api`)

Python 3.12, FastAPI + uvicorn, package `cg_api` (`services/api/pyproject.toml`). Status log: `services/api/STATUS.md`.

## Process and ports

`cg-api` (`cg_api/cli.py`) runs two `uvicorn.Server`s under one asyncio loop, then loads the default pool (first in `modes.yaml`) before serving.

| Listener | Default | Spec | Notes |
| --- | --- | --- | --- |
| public | `0.0.0.0:8000` (`CG_API_HOST/PORT`) | `contracts/openapi.yaml` | phones reach it on the LAN |
| internal | `127.0.0.1:9001` (`CG_INTERNAL_HOST/PORT`) | `contracts/openapi.internal.yaml` | `cli.main` exits unless the host is loopback (P9) |

## App factory (`app.py`)

- `create_apps()` returns `(public, internal)`. It exits unless `DEMO_MODE=1` (v2 has no real auth), then calls `ports.install_providers()`.
- **Routes are auto-discovered**: any module in `cg_api/routes/` (public) or `cg_api/internal/` that exposes `router = APIRouter()` is mounted. Set `operation_id=<spec operationId>`.
- **Example fallthrough**: every spec operation without a handler answers with its OpenAPI example (logged `example fallthrough`), so the contract is always fully served. Needs `X-CG-User` when the operation does.
- `app.py` is frozen; add routes by adding modules.

## Layers

| Path | Role |
| --- | --- |
| `routes/*.py`, `internal/*.py` | thin HTTP handlers (`system.py` has health, config, WS) |
| `domain/` | game rules: plans, joins, meetups, approvals, chat, nudges, people, rewards, verify, shares, prefs, privacy; `world.py` is the domain `World`; `runner.py` drives Muse steps per meetup |
| `ports.py` | Protocols `Muse`, `Laya`, `Extractor`, `Copy`, `AgentRunner` on `ports.ports`, plus stubs. `StubMuse` raises `Unavailable`; callers run their fallback |
| `providers/__init__.py` | `install(ports)` swaps in the real `MuseClient`, `LayaClient`, `MuseCopy`, `Extractor`; also `simulated_book` (booking code) |
| `muse/`, `laya/` | model clients ([muse.md](muse.md), [laya.md](laya.md)) |
| `store/` | in-memory `Store` (`store/__init__.py`), `bridge.py` (store ↔ domain World), `views.py` |
| `seed/` | seed loader + tiny built-in seed (`seed/tiny`) used when `data/seed/<pool>` is absent |
| `realtime/` | WebSocket hub |
| `agent/` | `ScriptedRun`, Muse's step sequence (pure; the caller persists and emits) |
| `contracts.py`, `settings.py`, `deps.py`, `errors.py` | spec loading, env + contract files, identity, error envelope |

## Store and World

One process, no locks, no persistence: `store.reset()` restores a post-seed deepcopy (demo reset ~0.05 s per STATUS). The domain `World` owns plans, joins, meetups, threads, approvals, connections, blocks, reports; the store aliases the same objects. Users, interests, signals, busy blocks stay with the store and are projected into the World by `bridge.sync(uid)` after every change (`store/__init__.py` docstring, `STATUS.md`). All seeded pools load side by side; users carry `poolId`; `loadSeed(poolId)` picks the primary pool whose `demo.json` drives demo state. The loader renames colliding venue/plan IDs across pools.

Seed load: `POST /internal/v1/seed/load` (background job, poll `getJob`) or `cg-api-load-seed <poolId>`. Real seed (301 people) loads in ~1.3 s with stub extraction (STATUS).

## Identity

Every public request needs `X-CG-User: u_<id>`. `deps.current_user` checks the pattern `^u_[a-z0-9]+$` and that the user is in the loaded store or World; otherwise 401. `listShares` is the exception (no header). WS: `/v1/ws?user=<id>`, same rule, close 1008 otherwise.

## Realtime

`realtime.emit(user_id, type, data)` sends `{type, eventId, at, data}` frames to that user's sockets (single process, fire-and-forget; `World.emit` forwards to it). Clients also **poll** (`client.pollIntervalS` 5 s, `feedRefreshS` 60 s from `/v1/config`) because events are hints and REST is truth (CONTRACTS §3, §6). Server answers `{"type":"pong"}` to `ping`.

## Error envelope

`{"error": {"code", "message", "retryable", "details"?}}` (`errors.py`). Status → code: 400 `validation_failed`, 401 `unauthenticated`, 403 `not_allowed`/`not_opted_in`, 404 `not_found`, 409 `conflict`, 422 `screened`, 429 `rate_limited`, 503 `unavailable` (`muse_unavailable`, `laya_unavailable`), unhandled 500 `internal` (`retryable: true`). Messages are final user copy; validators raise `errors.UserMessage` to set the 400 text.

## Privacy P1 to P11 (CONTRACTS §8)

| Rule | Where enforced (code) | Test |
| --- | --- | --- |
| P1 overlap only, P2 two-stage reveal, P4 sensitive | `domain/privacy.py` (`_allowed`, `shared_full`, `crowd` re-check every interest the matcher returns); `cg_matching.shared_interests/plan_overlap` filter first | `test_p1_*`, `test_p2_*`, `test_p4_*` in `tests/privacy/test_privacy.py` |
| P3 private profiles | `privacy.person_card` (first name, no avatar) | `test_p3_private_profile` |
| P5 no enumeration, P6 invisible outcomes | no list/search endpoint; `domain/runner.py` posts only "can't make this one" | `test_p5_*`, `test_p6_*` |
| P7 owner-only signals | `store/views.py` ("Owner-only (P7)") | `test_p7_owner_only` |
| P8 no location tracking | no location endpoint in the spec | `test_p8_centroid_and_directions` |
| P9 internal surface | separate app + loopback check in `cli.py`; blocked users filtered by `privacy.others_visible` | `test_p9_blocked_disappear_and_never_grouped`; loopback and DEMO_MODE guards in `tests/platform/test_guard.py` |
| P10 data stays home | only Muse and Laya clients make outbound calls; connectors/booking/payment are simulated in-process (`providers.simulated_book`) | `tests/ai/test_prompt_privacy.py` |
| P11 money and actions | `domain/approvals.py`; payments need an approved `payment` approval or amount ≤ `spendWithoutAskingCents` | `tests/domain/test_core_loop.py`, `test_runner.py`, `tests/agent/test_scripted.py` (mention spend limit) |

**TODO:** P10 and P11 test mapping is by file name/grep only; confirm by running those tests.

## DEMO_MODE

`DEMO_MODE=1` is mandatory. It enables the demo identity header, internal demo controls (`getDemoState/setDemoState`, `resetDemo`, `advanceMeetup`), params `demo.*` (synthetic counterparts, `stepDelayS` 1 to 2 s between visible steps, forced yes), `plans.demoFormAtMin` (a plan forms once `size.min` joined), and `feed.demoPinFeatured`.

## Run and test

```sh
cp .env.example .env
cd services/api && uv run cg-api                 # or: make api
cd services/api && uv run cg-api-load-seed pool_sf_city   # or: make seed POOL=...
cd services/api && uv run pytest -q              # CI: uv run --frozen pytest -q
python scripts/validate_contracts.py && python scripts/build_openapi_json.py --check   # make contracts-check
```

Tests force `MUSE_FAKE=1 LAYA_FAKE=1` and the tiny built-in seed (`tests/conftest.py`). Perf guard: `tests/perf/test_budgets.py`.
