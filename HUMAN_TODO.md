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

## 4. Google Calendar, Strava, Eventbrite, Luma, Beli: nothing to do

**Status: Handled.**

All connectors are **simulated** on purpose (CONTRACTS P10: in v2, user data goes only to Muse and Laya). "Connect" returns seeded records; no OAuth, no real accounts. Real Google Calendar would need an OAuth client and a contracts change; ask Claude if you want it.

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
- **Pitch framing for isolation:** in the sim (fake Laya), Common Ground with the adopted params (`fillToMax`, `reunionBoost 1`, `crowdBoost 0.5`) is 1.6-5.6 pts less isolated than before in all 25 cells, beats random by a wide margin and has the best show-up rate, but still trails greedy. Pitch "better than before, beats random, best show-up"; don't claim "beats greedy".
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
