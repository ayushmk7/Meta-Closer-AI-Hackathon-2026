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

1. Find your laptop's LAN IP: `ipconfig getifaddr en0`.
2. In `facebook-clone/.env`:
   ```sh
   EXPO_PUBLIC_CG_API_URL=http://<laptop LAN IP>:8000
   EXPO_PUBLIC_CG_USER=u_maya
   EXPO_PUBLIC_CG_MOCK=0
   ```
3. Laptop and phones must be on the same Wi-Fi. Venue Wi-Fi often blocks device-to-device traffic: bring a hotspot.

## 4. Google Calendar, Strava, Eventbrite, Luma, Beli: nothing to do

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

## 6. Checkpoint B on two iPhones (Expo Go)

Nobody has run the live backend inside the real app yet, so expect a few native-only bugs. Tell Claude what breaks.

- [ ] Phone 1 as `u_maya`, phone 2 as a second attendee (Settings › demo identity / second-phone mode).
- [ ] Logged-out Welcome page looks like Facebook's; "Log in" enters the app.
- [ ] Setup: connect Google Maps, interests appear, sensitive ones hidden.
- [ ] Plans home: hero plan first, Lands End nudge on Home, Rewards card, Quests, Surprise me opens a plan.
- [ ] Join hero → brief "gathering" → group forms → steps tick → approve $35 → confirmed.
- [ ] Event appears in the iPhone Calendar app; leave-by notification fires (dashboard "advance to leave_by").
- [ ] Chat: Muse intro; send "Muse, can we do 11 instead?" → Muse reschedules.
- [ ] Phones scan each other's QR (Meetup › Show my code · scan theirs) → both verified; Passport gets a stamp.
- [ ] After the meetup (dashboard "advance to completed"): stars + tags feedback, share with a caption → appears in Explore and the logged-out gallery.
- [ ] Six tabs fit at phone width; dark mode.

## 7. Decisions still open

- **Isolation pitch.** In the sim, Common Ground loses to greedy on "low-outgoing still isolated" (66% vs 52%). A fix (`matching.reunionBoost`) is being tested; if no setting wins, pitch "beats random by a wide margin, best show-up rate" instead of "beats greedy".
- **Learning loop.** Wired end to end and live ("Because you liked ceramics"), but the sim shows no significant gain yet; tuning is running. Present it as learning, not proven.
- **NFC/RFID tap.** Expo Go can't read NFC, so meeting verification is QR + typed code. Real NFC needs a custom dev build (`react-native-nfc-manager`), about 2 h or more.

## 8. Optional

- Teammates' Macs in herdr: each runs `echo '<your ~/.ssh/id_ed25519.pub>' >> ~/.ssh/authorized_keys`, then `herdr machine add <user>@<tailscale-host> --label <name>`.
- Never commit a filled-in `.env`.
