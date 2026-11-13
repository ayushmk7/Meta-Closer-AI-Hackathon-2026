# Runbook: whole demo stack on one laptop

Prereqs: `uv`, Node 24+, Expo Go on iPhones (SDK 57), phones on the laptop's network. Env vars: `.env.example`, `contracts/CONTRACTS.md` §12. Human setup steps: [`HUMAN_TODO.md`](../../../HUMAN_TODO.md). Device test script: [`CHECKPOINT_B.md`](../../../CHECKPOINT_B.md).

## Ports

| Port | What |
| --- | --- |
| 8000 | backend public API (+ WS `/v1/ws`), bound to `0.0.0.0` |
| 9001 | backend internal API, loopback only |
| 9100 | dashboard, loopback |
| 8090 | `laya-serve` |
| 8081 | Expo/Metro default |

## Steps

1. **Env.** `cp .env.example .env`; set `MODEL_API_KEY` and `MUSE_FAKE=0` `LAYA_FAKE=0`. `facebook-clone/.env`: `EXPO_PUBLIC_CG_API_URL=http://<LAN IP>:8000` (`ipconfig getifaddr en0`), `EXPO_PUBLIC_CG_USER=u_maya`, `EXPO_PUBLIC_CG_MOCK=0`.
2. **Laya (real).** Start `laya-serve` on `:8090` with the real weights (`LAYA_SERVE_BACKEND=laya`). **TODO:** the exact launch command and env live outside this repo; fill in. Check: `curl -s -X POST "$LAYA_URL/v1/systemone" -H 'Content-Type: application/json' -d '{"model":"laya","state":"User likes ceramics.","questions":{"q":{"type":"noul","instructions":"Is this sensitive?"}}}'` and confirm the answer field is one the adapter parses ([laya.md](laya.md)).
3. **Backend.** `MUSE_FAKE=0 LAYA_FAKE=0 make api` (`cd services/api && uv run cg-api`). It loads the default pool at start and logs `providers: muse <url>, laya <url>`.
4. **Seed both pools.** `make seed POOL=pool_sf_city` and `make seed POOL=pool_evt_closer_together` (`cg-api-load-seed`). Per `STATUS.md` all seeded pools load side by side and the argument picks the primary pool for demo state.
5. **Laya tables.** With the backend running: `cd services/sim && uv run cg-sim precompute --pool pool_sf_city` and `--pool pool_evt_closer_together` (no `--fake-laya`). It reloads the backend's tables. For sim-only ground-truth tables add `--use-ground-truth` ([laya.md](laya.md)).
6. **Muse precompute** (warms `services/api/.cache/muse_copy.json`): `cd services/api && uv run cg-api-precompute-muse pool_sf_city`, then `pool_evt_closer_together`. Re-run until it reports 0 failed ([muse.md](muse.md)). Restart the backend to start warm.
7. **Dashboard (optional).** `make dashboard` → http://127.0.0.1:9100.
8. **Metro.** `cd facebook-clone && npm start`; scan the QR in Expo Go. Restart Metro after editing `.env` (values are inlined at bundle time).

Offline fallback: `MUSE_FAKE=1 LAYA_FAKE=1`, or `EXPO_PUBLIC_CG_MOCK=1` for the app alone (`HUMAN_TODO.md` §5).

## Common failures

| Symptom | Cause / fix |
| --- | --- |
| Backend exits `refusing to start without DEMO_MODE=1` | set `DEMO_MODE=1` (default in `.env.example`) |
| Backend exits `CG_INTERNAL_HOST must be loopback` | keep `CG_INTERNAL_HOST=127.0.0.1` (P9) |
| Phone gets 401 `unauthenticated` | `X-CG-User` unknown: seed not loaded, or wrong `EXPO_PUBLIC_CG_USER` |
| App still shows mock data | `EXPO_PUBLIC_CG_API_URL` unset, `EXPO_PUBLIC_CG_MOCK=1`, or stale bundle: restart Metro. Web is always the mock |
| Phone can't reach the laptop | different networks, or venue Wi-Fi isolates clients: use a hotspot (HUMAN_TODO §3) |
| Muse text is templated, logs `muse ... failed` | key/model wrong (check the `muse models:` startup log, `NOT LISTED`), 503 load shedding (precompute retries), or `MUSE_FAKE=1` |
| Feeds thin, many interests "sensitive" | `LAYA_FAKE=1` hash marks random interests sensitive; run real Laya |
| `laya fallbacks above 5%` in the log | answer-field adapter mismatch ([laya.md](laya.md)) |
| `cg-sim precompute` connection refused | backend not running on `CG_INTERNAL_URL` (needed for the export); or use `--use-ground-truth` |
| **Stale Metro on 8081** (old bundle, wrong env) | kill the old `expo start`, free the port (`lsof -ti :8081 \| xargs kill`), restart. Worktree e2e tests hit whatever owns :8081; set `PLAYWRIGHT_BASE_URL` and use your own port |
| **HF download lock** (laya-serve hangs fetching weights) | **TODO:** team note, not in repo. Likely a stale Hugging Face cache `.lock` file; delete it and retry |
| **Tailscale DNS** (model API or HF hostnames not resolving) | **TODO:** team note, not in repo. Likely Tailscale's DNS override; try disabling it or set DNS manually |

The last three rows come from the team's operating experience as relayed by the orchestrator, not from code on this branch.
