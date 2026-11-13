# Human to-do for the demo

Things only a person can do. Code is frozen for the demo. Last updated 2026-11-13.

Current state and the full day-of checklist: [status.md](docs/common-ground/system/status.md). Exact commands: [runbook.md](docs/common-ground/system/runbook.md).

## Status at a glance

- [x] **Muse** (Meta's LLM API, `muse-spark-1.3`): key works (models list, Responses API with structured output and tools). Stored only in the gitignored `.env` as `MODEL_API_KEY`.
- [x] **Laya** (local `laya-serve`, real weights) runs on the laptop at `:8090`. Answer field verified against laya-serve 0.2.1 (`{"noul": p}`, #130).
- [x] **Real Laya tables for `pool_sf_city`**: `data/laya_tables/pool_sf_city/manifest.json` has `"layaModel": "laya"` (#138). The backend loads them at startup.
- [ ] Sim ground truth for the event pool is still fake Laya: `data/sim/laya_gt/pool_evt_closer_together/manifest.json` has `"layaModel": "fake"` (SF's is `"laya"`). There are no `data/laya_tables/pool_evt_closer_together` tables. This doesn't matter for the demo, which runs on SF. Quote only the `real_laya_center` sim numbers.
- [x] **Live Google Calendar** linked for `u_maya` (#137). Token in `services/api/.cache/tokens/` (gitignored). Relink on demo morning (see below).
- [x] **Muse copy cache** precomputed (`services/api/.cache/muse_copy.json`).
- [x] Live backend + live Muse + real Laya verified end to end (`scripts/e2e_flow.py`, 12/12 steps).
- [x] Meetups rebrand done (user-facing name is Meetups; API paths stay `/v1/plans`, see [backend.md](docs/common-ground/system/backend.md#naming-meetups-in-the-product-plans-in-the-api)).

## Demo morning

Run these in order. Commands are in the [runbook](docs/common-ground/system/runbook.md).

- [ ] Start Laya with uvicorn on `:8090` (not the `laya-serve` CLI: its torch child grabs `:8000`).
- [ ] Start the backend (`DEMO_MODE=1 MUSE_FAKE=0 LAYA_FAKE=0`, absolute `CG_DATA_DIR` / `CG_CONTRACTS_DIR`).
- [ ] **Seed: load only `pool_sf_city`, or nothing** (the backend already starts with SF as primary). Never load `pool_evt_closer_together` after it: the last pool loaded becomes primary and the feed opens on the event hero instead of `pl_sf_hero_wheel`.
- [ ] Relink Google Calendar on the laptop: `http://127.0.0.1:9001/internal/v1/connectors/google_calendar/link?userId=u_maya`. Testing-mode tokens expire after 7 days.
- [ ] Keep Sat 14 Nov, 10:00 AM free for the hero meetup (or block it on purpose to show "You're busy Saturday").
- [ ] **Set the app's backend IP.** The laptop's IP changes whenever it joins a different network (Wi-Fi, hotspot, a `100.x.x.x` carrier or VPN-style address):
  1. `ipconfig getifaddr en0`. Always run it; never reuse an old value.
  2. `facebook-clone/.env`: `EXPO_PUBLIC_CG_API_URL=http://<that IP>:8000`, `EXPO_PUBLIC_CG_USER=u_maya`, `EXPO_PUBLIC_CG_MOCK=0`.
  3. Restart Metro: `cd facebook-clone && npx expo start --clear` (values are baked into the bundle).
  4. A stale IP shows "That took too long. Try again." on the phone.
- [ ] Laptop and phones on the same network. Venue Wi-Fi often blocks device-to-device traffic; bring a hotspot.

## Phone setup (each demo iPhone)

- [ ] Open the app in Expo Go from the Metro QR code.
- [ ] **Tap Allow on notifications** before presenting. Otherwise the permission alert pops up over the screen when the meetup confirms.
- [ ] **Hide Expo Go's floating tools button** so it's not in the shot.
- [ ] Allow calendar access when asked (the app writes meetups to the iPhone calendar via `expo-calendar`).
- [ ] Smoke test as Maya: feed → join the hero → approve $35 → confirmed → send a chat message, reply in about 4 s.
- [ ] Between run-throughs: `curl -X POST http://127.0.0.1:9001/internal/v1/demo/reset`.

Full two-phone script: [CHECKPOINT_B.md](CHECKPOINT_B.md).

## Pitch notes (resolved)

- **Numbers** (real Laya, sim run `real_laya_center`, #138, 20 seeds, center cell): Common Ground **seats 92.7% of low-outgoing people at least once vs greedy 84.7%**, and leaves 37.2% still isolated at week 8 vs greedy 33.3% and random 88.2%. Pitch "includes the people others miss, far better than random". Don't claim "beats greedy" or "best show-up" (greedy 58.3% vs Common Ground 56.6%). Laya eval: sensitive places recall 1.0; sensitive interests rely on the taxonomy flags (Laya recall 0.0); routines not detected.
- **Learning loop:** live in the product ("Because you liked ceramics"); the sim found no robust gain on held-out seeds, so present it as learning, not proven. Params stay at prefAlpha 0.3 / prefBoost 0.3.
- **Simulated things:** other attendees, bookings, payments, the restaurant call (UI only), and every connector except Google Calendar are simulated. The app no longer shows demo labels; the data still flags them. Say so in the pitch.
- **Chat replies** from other attendees are templated lines on purpose (real Muse refuses to speak as a person).
- **NFC/RFID tap:** QR + typed code (Expo Go can't read NFC); real NFC needs a dev build.
- **Muse calling venues** is a faux call in the UI only (#151); no telephony.

## Google Calendar setup (done; for reference)

1. Google Cloud project with the Google Calendar API enabled; consent screen External, Testing mode; your account as a test user; scope `https://www.googleapis.com/auth/calendar.freebusy`.
2. OAuth client (Web application), redirect URI exactly `http://127.0.0.1:9001/internal/v1/connectors/google_calendar/callback`.
3. `.env`: `CONNECTORS_LIVE=1`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
4. With the backend running, open the link URL above on the laptop and approve.
5. On the phone, turn on Google Calendar in Common Ground settings. Meetups show "Fits your …" or "You're busy …" from the real calendar.

## Offline fallback

`MUSE_FAKE=1 LAYA_FAKE=1` for the backend, or `EXPO_PUBLIC_CG_MOCK=1` for the app alone.

## After the hackathon

- [ ] **Rotate the Muse API key** (`MODEL_API_KEY`).
- [ ] **Rotate the Google OAuth client secret** (`GOOGLE_CLIENT_SECRET`).
- [ ] Revoke the Google Calendar token in the Google account and delete `services/api/.cache/tokens/`.
- [ ] Never commit a filled-in `.env` or `facebook-clone/.env`.
- [ ] Optional: real Laya ground truth for the event pool; `thread.typing` for people (#205, closed unmerged); the open items in [perf-and-bugs.md](docs/common-ground/system/perf-and-bugs.md#open-low-priority).

## Optional

- Teammates' Macs in herdr: each runs `echo '<your ~/.ssh/id_ed25519.pub>' >> ~/.ssh/authorized_keys`, then `herdr machine add <user>@<tailscale-host> --label <name>`.
