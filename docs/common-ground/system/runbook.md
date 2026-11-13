# Runbook: the demo stack on one laptop

The exact commands used to bring up the live demo (real Laya, real Muse, live Google Calendar, two iPhones in Expo Go). Current state and the day-of checklist: [status.md](status.md). Human-only steps: [`HUMAN_TODO.md`](../../../HUMAN_TODO.md). Backend internals: [backend.md](backend.md). Device test script: [`CHECKPOINT_B.md`](../../../CHECKPOINT_B.md).

Prereqs: `uv`, Node 24+, Expo Go (SDK 57) on the iPhones, `laya-serve` installed as a uv tool, the phones and the laptop on the same network. Env var reference: [backend.md#environment-variables](backend.md#environment-variables), `.env.example`, `contracts/CONTRACTS.md` §12.

## Ports

| Port | What | Bound to |
| --- | --- | --- |
| 8000 | backend public API + WebSocket `/v1/ws` | `0.0.0.0` (phones on the LAN) |
| 9001 | backend internal API (seed, demo controls, Google link) | `127.0.0.1` only |
| 8090 | laya-serve | `0.0.0.0` |
| 8081 | Expo / Metro | |
| 9100 | dashboard (optional) | `127.0.0.1` |

## 0. Env files

Repo root `.env` (copy `.env.example`; gitignored). Set at least `MODEL_API_KEY`, and for live Google Calendar `CONNECTORS_LIVE=1`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Never paste these values into docs, chat or commits.

`facebook-clone/.env` (gitignored):

```sh
EXPO_PUBLIC_CG_API_URL=http://<LAN IP>:8000
EXPO_PUBLIC_CG_USER=u_maya
EXPO_PUBLIC_CG_MOCK=0
```

Nothing loads `.env` automatically: `cg_api/settings.py` reads only the process environment, and `make api` doesn't source it. The commands below export it explicitly.

## 1. Laya (real model) on :8090

```sh
cd /tmp && LAYA_SERVE_BACKEND=laya LAYA_SERVE_PRELOAD=true HF_HUB_DISABLE_XET=1 HF_HUB_OFFLINE=1 \
  "$(uv tool dir)/laya-serve/bin/python" -m uvicorn laya_serve.app:create_app --factory --host 0.0.0.0 --port 8090
```

- Run uvicorn directly. The `laya-serve` CLI starts a torch child process that binds `0.0.0.0:8000`, which collides with the backend's public port.
- `LAYA_SERVE_BACKEND=laya` loads the real weights. `LAYA_SERVE_PRELOAD=true` loads them at startup rather than on the first request.
- `HF_HUB_OFFLINE=1` uses the cached weights and never contacts Hugging Face. `HF_HUB_DISABLE_XET=1` avoids the Xet download path. On a fresh machine, download the weights once without `HF_HUB_OFFLINE`.
- `<laya-serve venv python>` is the uv tool's interpreter; `$(uv tool dir)/laya-serve/bin/python` resolves it.

Check (the answer must contain a number under `noul`, which is what the backend parses; see [laya.md](laya.md)):

```sh
curl -s -X POST http://127.0.0.1:8090/v1/systemone -H 'Content-Type: application/json' \
  -d '{"model":"laya","state":"User likes ceramics.","questions":{"q":{"type":"noul","instructions":"Is this sensitive?"}}}'
```

## 2. Backend on :8000 and :9001

From `services/api`:

```sh
cd services/api
set -a && . ../../.env && set +a && \
CG_DATA_DIR="$(cd ../../data && pwd)" CG_CONTRACTS_DIR="$(cd ../../contracts && pwd)" \
DEMO_MODE=1 MUSE_FAKE=0 LAYA_FAKE=0 LAYA_URL=http://127.0.0.1:8090 LAYA_MODEL=laya \
CG_API_PORT=8000 CG_INTERNAL_PORT=9001 uv run cg-api
```

- `set -a` exports everything in `.env`; the inline assignments after it win.
- `CG_DATA_DIR` and `CG_CONTRACTS_DIR` must be absolute. `.env.example` sets `./data` and `./contracts`, which would resolve against `services/api` and fail.
- At startup the server loads every seeded pool with `pool_sf_city` (first in `contracts/modes.yaml`) as the primary pool. No seed command is needed after this.

Expected log lines:

- `providers: muse https://api.meta.ai/v1, laya http://127.0.0.1:8090`
- `muse models: [...] (using muse-spark-1.3)`. `NOT LISTED` at the end means `MUSE_MODEL` is wrong.
- `laya tables loaded from …/data/laya_tables/pool_sf_city: {...}`
- `seed loaded: {'poolId': 'pool_sf_city', 'pools': ['pool_sf_city', 'pool_evt_closer_together'], …}`

Check: `curl -s http://127.0.0.1:8000/v1/health` returns `"muse":"ok","laya":"ok","demoMode":true`. Check from the phone's network too: `curl -s http://<LAN IP>:8000/v1/health`.

## 3. Muse copy cache (before the demo)

The server serves templates at once and fills Muse's wording in the background (Muse takes about 10 s per call). Warm the cache in a separate process so the first screens already have Muse's text:

```sh
cd services/api
set -a && . ../../.env && set +a && \
CG_DATA_DIR="$(cd ../../data && pwd)" CG_CONTRACTS_DIR="$(cd ../../contracts && pwd)" \
MUSE_FAKE=0 LAYA_FAKE=0 LAYA_URL=http://127.0.0.1:8090 uv run cg-api-precompute-muse pool_sf_city
```

It prints progress and finishes with `done: N cached (M new), K failed`. Run it again until `0 failed` (it resumes). It writes `services/api/.cache/muse_copy.json` and doesn't touch the running server, which reads that file only at startup, so restart the backend afterwards to start warm. Details: [muse.md](muse.md).

## 4. Seed

**For the demo, do nothing, or load only `pool_sf_city`.** Never load `pool_evt_closer_together` on the demo backend.

Why (`services/api/src/cg_api/seed/__init__.py`, `load`): every seed load builds a fresh world with **all** seeded pools side by side (so the Event mode switch still works). The pool you name becomes the **primary** pool, and its `demo.json` sets Maya's pinned featured plans, the hero plan, the nudge plan, the live second-phone user and the demo's fake location. The last load wins. Loading `pool_evt_closer_together` after `pool_sf_city` makes the event pool primary: Maya's feed then opens on `pl_evt_hero_lunch_walk` instead of `pl_sf_hero_wheel`, and pinned event plans show travel times like "211 min by transit" from SF.

A load also wipes all live state (joins, meetups, chats), the same as a reset.

```sh
cd services/api && CG_INTERNAL_PORT=9001 uv run cg-api-load-seed pool_sf_city   # or: make seed POOL=pool_sf_city
```

Check which pool is primary: `curl -s http://127.0.0.1:9001/internal/v1/demo` should show `"liveUserId":"u_0098"` and `fakeLocation.lat` about 37.76. The event pool gives `u_e007` and 37.49. If it's wrong, load `pool_sf_city` again.

## 5. Laya tables (already done for SF)

`data/laya_tables/pool_sf_city/` holds real Laya tables (`manifest.json`: `"layaModel": "laya"`, `questionsVersion` 2). The backend registers them at seed load. To regenerate, with laya-serve and the backend both running:

```sh
cd services/sim && uv run cg-sim precompute --pool pool_sf_city
```

It reads `/internal/v1/pools/pool_sf_city/export` and posts `/internal/v1/laya-tables/reload` (`CG_INTERNAL_URL`, default `http://127.0.0.1:9001`). The sim's ground-truth tables in `data/sim/laya_gt/` are real for SF, while `pool_evt_closer_together` still uses `"fake"`. See [laya.md](laya.md) and [sim.md](sim.md).

## 6. Google Calendar (live)

With `CONNECTORS_LIVE=1` and the Google client in `.env`, open this **on the laptop**:

```
http://127.0.0.1:9001/internal/v1/connectors/google_calendar/link?userId=u_maya
```

Approve in Google. The callback page shows "Linked Google Calendar for u_maya", and either the number of busy blocks in use or a reminder to turn on Google Calendar in the app's settings. The token is stored in `services/api/.cache/tokens/google_calendar/u_maya.json` (gitignored). The OAuth client's redirect URI must be exactly `http://127.0.0.1:9001/internal/v1/connectors/google_calendar/callback`. Google's Testing mode expires tokens after 7 days, so link again on demo morning. Details: [backend.md#live-google-calendar-137](backend.md#live-google-calendar-137).

## 7. Dashboard (optional)

`make dashboard` → http://127.0.0.1:9100.

## 8. App (Metro + Expo Go)

1. Get the laptop's current IP: `ipconfig getifaddr en0`. Always run this; don't reuse an old value. The address changes whenever the network changes, and it isn't always a home-style `192.168.x.x` or `10.x.x.x`. A hotspot or carrier network can give a `100.x.x.x` address, which is still the right one to use.
2. Put it in `facebook-clone/.env`: `EXPO_PUBLIC_CG_API_URL=http://<that IP>:8000`.
3. Restart Metro with a clean cache: `cd facebook-clone && npx expo start --clear`. `EXPO_PUBLIC_*` values are inlined into the JS bundle when Metro builds it, so editing `.env` does nothing until Metro restarts with `--clear`.
4. Scan the QR code with the iPhone camera to open Expo Go. On first launch tap **Allow** for notifications. Hide Expo Go's floating tools button before presenting.

A stale IP shows **"That took too long. Try again."**: the app aborts each request after 10 s (`request()` default in `facebook-clone/src/features/common-ground/api.ts`). Slow calls (`askMuse`, `createPlan`, `connectConnector`) get `LONG` = 30 s. With no route to the host you may instead see "Couldn't reach Common Ground. Check your connection."

## 9. Smoke test (about 1 minute)

On Maya's phone, after opt-in and setup:

1. **Feed:** the Meetups tab opens For you with **Saturday wheel-throwing drop-in** (`pl_sf_hero_wheel`) first.
2. **Join the hero:** tap I'm in. It already has two seeded joins (size min 3), so Maya's join reaches the minimum. "Muse is gathering people" shows for 2 to 5 s, then the group forms.
3. **Approve:** Muse's steps appear 1 to 2 s apart. Approve the payment request ($35 prepaid). Synthetic members approve theirs automatically.
4. **Confirmed:** the meetup reaches Confirmed with a booking code.
5. **Chat:** send a message in the group chat. A synthetic member replies in about 2 to 5 s (typically ~4 s) with a short templated line. This is intentional, see [backend.md#demo_mode-behaviour](backend.md#demo_mode-behaviour).

To check without phones: `python3 scripts/e2e_flow.py --reset` walks the full flow through the API (Little Fern nudge plan, not the hero). **It resets every user.**

Between run-throughs reset all live state: `curl -X POST http://127.0.0.1:9001/internal/v1/demo/reset` (restores the state of the last seed load, so make sure that was `pool_sf_city`).

Offline fallback: `MUSE_FAKE=1 LAYA_FAKE=1` for the backend, or `EXPO_PUBLIC_CG_MOCK=1` for the app alone. Web always uses the mock.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| App: "That took too long. Try again." on every screen | `EXPO_PUBLIC_CG_API_URL` has an old IP (network changed), or the backend is down | `ipconfig getifaddr en0`, update `facebook-clone/.env`, `npx expo start --clear`, reload in Expo Go; check `curl http://<IP>:8000/v1/health` |
| App: "Couldn't reach Common Ground. Check your connection." | no route: different networks, or venue Wi-Fi isolates clients | put laptop and phones on the same network; use a phone hotspot |
| Only the Muse bar says "That took too long" | real Muse is slow (about 10 s); the app allows 30 s; the backend gives up at 8 s and falls back to a keyword reply | retry; nothing to fix on stage |
| Feed opens on `pl_evt_hero_lunch_walk`, or "211 min by transit" | the event pool was loaded last and is primary | `uv run cg-api-load-seed pool_sf_city` (wipes live state) |
| App shows mock data | `EXPO_PUBLIC_CG_MOCK=1`, URL unset, stale bundle, or running on web | fix `.env`, `npx expo start --clear` |
| Phone gets 401 "Pick a demo user to continue." | `X-CG-User` not in the loaded world | check `EXPO_PUBLIC_CG_USER=u_maya`; check the seed loaded |
| Backend exits `refusing to start without DEMO_MODE=1` | `DEMO_MODE` not `1` | set `DEMO_MODE=1` |
| Backend exits `CG_INTERNAL_HOST must be loopback` | internal host set to a LAN address | `CG_INTERNAL_HOST=127.0.0.1` |
| Internal call returns 403 "The internal API answers loopback hosts only." | request used a non-loopback Host or Origin (e.g. LAN IP in the browser) | use `127.0.0.1` in the URL |
| Backend fails at startup reading seeds or contracts | relative `CG_DATA_DIR` / `CG_CONTRACTS_DIR` from `.env` while in `services/api` | pass absolute paths as in step 2 |
| `[Errno 48] address already in use` on 8000 | another process holds the port, e.g. the `laya-serve` CLI's torch child | start laya-serve with uvicorn as in step 1; find the owner with `lsof -nP -iTCP:8000 -sTCP:LISTEN` |
| `/v1/health` says `"laya":"fake"` or `"muse":"fake"` | `LAYA_FAKE=1` / `MUSE_FAKE=1` in the environment | export `0` and restart |
| Log `laya … failed` / `laya fallbacks above 5%` | laya-serve down, wrong `LAYA_URL`, or an answer-field mismatch | check step 1's curl; see [laya.md](laya.md) |
| Many interests marked sensitive, thin feeds | running on `LAYA_FAKE=1` (hash fake) | run real Laya |
| Muse text is templated everywhere; logs `muse … failed` | bad key or model (`NOT LISTED` in `muse models:`), 503 load shedding, or `MUSE_FAKE=1` | check key and model; run step 3 and restart the backend |
| Chat replies are short stock lines | by design: real Muse won't speak as a person | none |
| No chat reply | the other members are all live (`counterpart: live` covers the second phone), or every member left | check `curl 127.0.0.1:9001/internal/v1/demo` |
| Google link page: 404 "No live mode for that app" | `CONNECTORS_LIVE` not `1`, or client ID/secret missing | set them in `.env`, restart backend |
| Google: `redirect_uri_mismatch` | OAuth client redirect URI differs | register `http://127.0.0.1:9001/internal/v1/connectors/google_calendar/callback` |
| Callback: "This sign-in link expired or was already used." | state older than 10 min, or page reloaded | open the link page again |
| Log `token refresh failed … link the account again` | Testing-mode refresh token expired (7 days) or revoked | redo step 6 |
| Calendar not reflected in the app | Google Calendar not turned on in the app's settings, or 60 s refresh throttle | turn it on; wait a minute or reopen the feed |
| `cg-sim precompute` connection refused | backend internal API not on `CG_INTERNAL_URL` | start the backend first |
| laya-serve tries to download, or hangs on startup | weights not cached while `HF_HUB_OFFLINE=1`, or a stale Hugging Face lock | download once without `HF_HUB_OFFLINE`; remove the stale `.lock` file in the HF cache (team experience, not in repo) |
| Old bundle or old env on :8081 | an older Metro still owns the port | stop it yourself and rerun `npx expo start --clear`. Worktree e2e runs hit whatever owns :8081, so set `PLAYWRIGHT_BASE_URL` and use your own port |
| Notifications never show | permission not granted in Expo Go | iOS Settings → Expo Go → Notifications, or reinstall and tap Allow |
