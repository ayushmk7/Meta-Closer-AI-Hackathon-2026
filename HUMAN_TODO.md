# Human to-do for the demo

Things only a person can do. The code is done; the app runs on fakes until these are filled in. Last updated 2026-11-12.

## 1. Muse (Meta's model API): required for a live demo

Without it, Muse runs on the scripted fake (`MUSE_FAKE=1`).

1. Get an API key for `https://api.meta.ai/v1`.
2. In `.env` (copy from `.env.example`):
   ```sh
   MODEL_API_KEY=<your key>
   MUSE_BASE_URL=https://api.meta.ai/v1
   MUSE_MODEL=muse-spark-1.3
   MUSE_FAKE=0
   ```
3. Check that the model name exists. On startup the backend logs the models it can see; or run:
   ```sh
   curl -s -H "Authorization: Bearer $MODEL_API_KEY" https://api.meta.ai/v1/models
   ```
   If `muse-spark-1.3` isn't listed, put the right name in `MUSE_MODEL`.
4. Confirm the endpoint supports the Responses API with tools and structured output (PRD-2 assumes it). If not, tell Claude.

## 2. Laya: required for real sensitivity checks

**Status: the orchestrator is running Laya locally.**

Without it, Laya runs on the hash fake (`LAYA_FAKE=1`), which marks random interests as sensitive (e.g. "Book swaps").

1. Run `laya-serve` somewhere reachable, or get its URL.
2. In `.env`:
   ```sh
   LAYA_URL=http://<host>:8090
   LAYA_MODEL=laya
   LAYA_FAKE=0
   ```
3. Verify the answer field names. `contracts/laya_questions.yaml` says they're unverified. Send one request and paste the response to Claude, who will fix the single mapping in each `LayaClient` (backend `services/api/src/cg_api/laya/`, sim `services/sim/src/cg_sim/laya/`):
   ```sh
   curl -s -X POST "$LAYA_URL/v1/systemone" -H 'Content-Type: application/json' \
     -d '{"model":"laya","state":"User likes ceramics.","questions":{"q":{"type":"noul","instructions":"Is this sensitive?"}}}'
   ```
4. Then regenerate the real Laya tables (the committed ones are fakes): `cd services/sim && uv run cg-sim precompute --pool pool_sf_city` and the same for `pool_evt_closer_together`.

## 3. Phone networking: required for the iPhones

**Status: LAN IP done: 172.20.5.84** (so `EXPO_PUBLIC_CG_API_URL=http://172.20.5.84:8000`).

1. Find your laptop's LAN IP: `ipconfig getifaddr en0`.
2. In `facebook-clone/.env`:
   ```sh
   EXPO_PUBLIC_CG_API_URL=http://<laptop LAN IP>:8000
   EXPO_PUBLIC_CG_USER=u_maya
   EXPO_PUBLIC_CG_MOCK=0
   ```
3. Laptop and phones must be on the same Wi-Fi. Venue Wi-Fi often blocks device-to-device traffic: bring a hotspot.

## 4. Google Calendar: link Maya's real account

Optional. Without it, everything runs on seeded data.

1. Google Cloud: create a project, enable the Google Calendar API, configure the consent screen (External, Testing mode), add your Google account as a test user, add the scope `https://www.googleapis.com/auth/calendar.freebusy`.
2. Create an OAuth client (Web application) with the redirect URI `http://127.0.0.1:9001/internal/v1/connectors/google_calendar/callback`.
3. In `.env`: `CONNECTORS_LIVE=1`, `GOOGLE_CLIENT_ID=...`, `GOOGLE_CLIENT_SECRET=...`.
4. With `make api` running, open `http://127.0.0.1:9001/internal/v1/connectors/google_calendar/link?userId=u_maya` on the laptop and approve.
5. On the phone, turn on Google Calendar in Common Ground settings. Meetups show "Fits your …" or "You're busy …" from the real calendar.
6. Testing-mode tokens expire after 7 days, so link again on demo morning.
7. Hero plan: Sat 14 Nov, 10:00. Keep that time free, or block it on purpose to show "You're busy Saturday".

Strava, Eventbrite, Luma, Beli and the rest stay simulated (seeded records, no real accounts).

The iPhone's own calendar is real: the app writes meetups to it via `expo-calendar` after you allow access.

## 5. Run the stack

```sh
cp .env.example .env            # then fill in 1-3
make api                        # backend: public :8000, internal :9001
make seed POOL=pool_sf_city     # load the city pool (and pool_evt_closer_together for Event mode)
make dashboard                  # laptop dashboard on 127.0.0.1:9100
make app                        # Expo dev server; scan the QR with Expo Go
```

Offline fallback: set `MUSE_FAKE=1 LAYA_FAKE=1`, or `EXPO_PUBLIC_CG_MOCK=1` for the app alone.

## 6. Checkpoint B on two iPhones

See [CHECKPOINT_B.md](CHECKPOINT_B.md).

## 7. Decisions (resolved 2026-11-12)

**Status: resolved, nothing to do.**

- **Demo labels:** keep the muted "· Demo data" / "Simulated booking" labels (CONTRACTS §2: simulated things are labeled).
- **Web directions:** the meetup address is a Directions link on web too (PRD-1 §2 updated).
- **Pitch framing (real Laya, 2026-11-13):** sim run `real_laya_center` (#138, real laya-serve tables, 20 seeds, center cell). Common Ground **seats 92.7% of low-outgoing people at least once vs greedy 84.7%**, and leaves 37.2% still isolated at week 8 vs greedy 33.3% and random 88.2%. Pitch "includes the people others miss, far better than random"; don't claim "beats greedy" or "best show-up" (greedy 58.3% vs CG 56.6%). Learning loop: no measurable gain. Laya eval: sensitive places recall 1.0; sensitive interests rely on the taxonomy flags (Laya recall 0.0); routines not detected.
- **Learning loop:** live in the product ("Because you liked ceramics"); the sim found no robust gain on held-out seeds, so present it as learning, not proven. Params stay at prefAlpha 0.3 / prefBoost 0.3.
- **NFC/RFID tap:** QR + typed code (Expo Go can't read NFC); real NFC needs a dev build.

## Already done (no action)

- Muse API key works (models list, Responses API with structured output and tools); stored only in the gitignored `.env`. Muse copy cache precomputed for both pools (`services/api/.cache/`).
- Live backend + live Muse verified end to end (Checkpoint A, batch-2 smoke, e2e 12/12).
- Demo labels removed from the app (batch 4); simulated stays flagged in data. Mention it in the pitch/README disclosure.
- Muse calling venues is a "Coming soon" teaser only (no telephony).

## 8. Optional

- Teammates' Macs in herdr: each runs `echo '<your ~/.ssh/id_ed25519.pub>' >> ~/.ssh/authorized_keys`, then `herdr machine add <user>@<tailscale-host> --label <name>`.
- Never commit a filled-in `.env`.
