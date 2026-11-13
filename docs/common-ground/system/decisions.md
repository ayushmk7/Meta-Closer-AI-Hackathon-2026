# Decisions

Dated. Source of truth is `contracts/CONTRACTS.md` (Decisions + changelog); human decisions are marked with where each is recorded. Items marked **(brief)** come from the orchestrator's instruction for this doc set and are not recorded elsewhere in the repo yet.

## Contracts Decisions (integrator, 2026-11-12)

| Date | Decision |
| --- | --- |
| 2026-11-12 | Contracts v2: plans-first redesign after judge feedback (changelog v2.0.0). URL prefix stays `/v1`; `apiVersion` "2" |
| 2026-11-12 | Timezone: every local time is `America/Los_Angeles` |
| 2026-11-12 | Plan horizon anchor: `startsAt` ≥ `2026-11-13T12:00:00-08:00` |
| 2026-11-12 | Plan titles ≤ 60 chars (schema hard cap 80) |
| 2026-11-12 | Nudge plan `origin: signal`; event pool nudge is any free plan in the window; "Maya's frequent place" rule is city only |
| 2026-11-12 | Hero, nudge and third featured plan may be hand-built by the sim seed |
| 2026-11-12 | `config.demo.stepDelayS` added (optional), mirrors `params.demo.stepDelayS` |
| 2026-11-12 | Laya answer fields unverified; one `LayaClient` adapter per service, fail loudly (>5% fallbacks) rather than fake silently |
| 2026-11-12 | Rewards: optional `Me.rewards`, private, never used in ranking. "Surprise me" client-only |
| 2026-11-12 | Quests and Passport client-only (batch 2) |
| 2026-11-12 | Shares are anonymous: no person fields, venue photo only; sensitive venues can't be shared (422) |
| 2026-11-12 | Verification by QR, not NFC (NFC is impossible in Expo Go): "show my code, scan theirs", same 6 characters for typed entry; one scan verifies both and counts the meetup |
| 2026-11-12 | `reunionBoost`, `crowdBoost`, `fillToMax` added defaulting to off (byte-identical output) |
| 2026-11-12 | Isolation params adopted: `fillToMax: true`, `reunionBoost: 1.0`, `crowdBoost: 0.5` from sim run `20261113T011854Z_pool_sf_city_grid` (#62), fake-Laya, "suggestive, not evidence"; revisit with real tables |
| 2026-11-12 | Demo labels removed (batch 4): no "Demo data"/"Simulated booking"/"Demo payment" in the UI; `simulated` flags stay in data; disclosure lives in the pitch and README. Venue phone booking is a "Coming soon" teaser only (no data, no telephony) |
| 2026-11-12 | Changelog v2.1.0 (batch 2): shares, `verifyAttendee`, `prefBoost`/`prefAlpha`, connectors `luma` and `beli`, `expo-camera` + `qrcode-generator`. v2.1.1: labels flagged in data. v2.1.2: `TabItem.headerAction` |

## Human decisions

| Date | Decision | Recorded in |
| --- | --- | --- |
| 2026-11-12 | Web: Common Ground tab is an extra desktop header destination plus a Menu item; web runs on the in-app mock only (D5) | CONTRACTS §11, PRD-1 |
| 2026-11-12 | Web directions open as a link in a new tab | PRD-1 line 27 |
| (undated) | Maya's pitch is "Maya wants friends who are into what she's into", not "just moved to SF"; her clone seed is unchanged | PRD-4 "Resolved", `docs/common-ground/README.md` |
| 2026-11-12 | All connectors simulated on purpose (P10: user data goes only to Muse and Laya) | `HUMAN_TODO.md` §4 |
| 2026-11-12 | Labels removed, QR not NFC, call teaser "coming soon" | see rows above |
| (brief) | Phone-first: the demo is judged on iPhones in Expo Go, web is secondary | not recorded in repo. **TODO:** record in DESIGN |
| (brief) | Pitch framing details beyond Maya's pitch | **TODO:** record in DESIGN |
