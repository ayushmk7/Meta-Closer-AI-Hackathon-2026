# Decisions

Dated, newest section last. The source of truth is `contracts/CONTRACTS.md` (Decisions + changelog). Human decisions say where each is recorded. Items marked **(brief)** come from the orchestrator's instructions for this doc set; the repo holds evidence for them (cited) but no written decision.

**Code freeze: 2026-11-13** (brief). The demo runs from `main` as of the freeze. Only docs change after it; features in flight were cancelled, not merged (for example `thread.typing`, below).

## Contracts decisions (integrator, 2026-11-12)

| Date | Decision |
| --- | --- |
| 2026-11-12 | Contracts v2: plans-first redesign after judge feedback (changelog v2.0.0). URL prefix stays `/v1`; `apiVersion` "2" |
| 2026-11-12 | Timezone: every local time is `America/Los_Angeles` |
| 2026-11-12 | Plan horizon anchor: `startsAt` ≥ `2026-11-13T12:00:00-08:00` |
| 2026-11-12 | Plan titles ≤ 60 chars (schema hard cap 80) |
| 2026-11-12 | Nudge plan `origin: signal`; event pool nudge is any free plan in the window; "Maya's frequent place" rule is city only |
| 2026-11-12 | Hero, nudge and third featured plan may be hand-built by the sim seed |
| 2026-11-12 | `config.demo.stepDelayS` added (optional), mirrors `params.demo.stepDelayS` |
| 2026-11-12 | Laya answer fields unverified; one `LayaClient` adapter per service, fail loudly (>5% fallbacks) rather than fake silently. Resolved 2026-11-13: both adapters parse the real `laya-serve` fields (#130, #131) |
| 2026-11-12 | Rewards: optional `Me.rewards`, private, never used in ranking. "Surprise me" is client-only: a random not-joined plan from the viewer's own (already tailored) `getFeed` |
| 2026-11-12 | Quests and Passport client-only (batch 2) |
| 2026-11-12 | Shares are anonymous: no person fields, venue photo only; sensitive venues can't be shared (422) |
| 2026-11-12 | Verification by QR, not NFC (NFC is impossible in Expo Go): "show my code, scan theirs", same 6 characters for typed entry; one scan verifies both and counts the meetup |
| 2026-11-12 | `reunionBoost`, `crowdBoost`, `fillToMax` added defaulting to off (byte-identical output) |
| 2026-11-12 | **Matching params adopted**: `fillToMax: true`, `reunionBoost: 1.0`, `crowdBoost: 0.5` (`contracts/params.yaml`) from sim run `20261113T011854Z_pool_sf_city_grid` (#62). Selected on seeds 0-9 and confirmed on held-out seeds 10-59 in all 25 cells: low-outgoing isolation improves 1.6-5.6 pts with fill -1.9 to -2.3 pts. Run on fake-Laya tables, so "suggestive, not evidence"; the real-Laya run below is the evidence the pitch uses |
| 2026-11-12 | Demo labels removed (batch 4, human): no "Demo data" / "Simulated booking" / "Demo payment" in the UI; `simulated` flags stay in data; disclosure lives in the pitch and README (changelog v2.1.1) |
| 2026-11-12 | Changelog v2.1.0 (batch 2): shares, `verifyAttendee`, `prefBoost`/`prefAlpha`, connectors `luma` and `beli`, `expo-camera` + `qrcode-generator`. v2.1.1: labels flagged in data. v2.1.2: `TabItem.headerAction` |

## Human decisions, 2026-11-12

| Date | Decision | Recorded in |
| --- | --- | --- |
| 2026-11-12 | Web: the feature's tab is an extra desktop header destination plus a Menu item; web runs on the in-app mock only (D5) | CONTRACTS §11, PRD-1 |
| 2026-11-12 | **Web Directions link kept**: the meetup address is a Directions link on web too (opens `directions.google` in a new tab) | `HUMAN_TODO.md` §7, PRD-1 §2; code `Meetup.tsx` |
| (undated) | Maya's pitch is "Maya wants friends who are into what she's into", not "just moved to SF"; her clone seed is unchanged | PRD-4 "Resolved", `docs/common-ground/README.md` |
| 2026-11-12 | All connectors simulated on purpose (P10: user data goes only to Muse and Laya). Amended 2026-11-13 for live Google Calendar, below | `HUMAN_TODO.md` §4 |
| 2026-11-12 | Labels removed, QR not NFC | rows above |

## Decisions since 2026-11-12 (all 2026-11-13)

| Decision | Evidence |
| --- | --- |
| **Rebrand "Plans" → "Meetups"** for every user-facing string: tab, menu, Inbox source, screen copy, backend copy, Muse prompts ("call them meetups, never plans"), unlock labels, pool descriptions. **Not renamed:** code identifiers, file names, routes (`/common-ground/plan/[planId]`), API paths and fields (`/v1/plans`, `planId`), and the verb "Plan something like this". | #144 shell, #145 contracts/docs, #146 app strings, #147 sim pools, #148 backend copy, #150 fixtures, #152 tests |
| **Little Fern Kitchen nudge**: Maya's frequent place in `pool_sf_city` is the fictional Little Fern Kitchen (Hayes Valley); the nudge plan is a pay-at-venue table for 4 at 7 PM, so Muse visibly reserves a table. "Free" relaxed to "no payment approval". | CONTRACTS Decisions "Nudge venue"; #117, #120, #121, #126, #127 |
| **Faux restaurant call, option A: UI only.** Muse "calls" the restaurant in the app: ringing, a four-line transcript where Muse says it is an AI, then "Reserved". No call is placed; no telephony, backend, contract or data change. The app keys it off a step label starting `Reserved a table`. It replaces the earlier "Coming soon" call teaser (so the CONTRACTS Decisions line "shown only as a Coming soon teaser" and `HUMAN_TODO.md` "Already done" are out of date on this point). | #151, #196; "option A" naming (brief) |
| **Live Google Calendar free/busy is the only real external data.** With `CONNECTORS_LIVE=1` the operator links one Google account per demo user on the laptop (only `u_maya` in the demo). Scope `calendar.freebusy`, primary calendar; the backend swaps the seeded busy blocks for real ones, never writes back, and keeps the token in the backend. **P10 amended** to allow exactly this. Everything else (other connectors, booking, payments) stays simulated. | Contracts v2.3.0 #136; built in #137 (Utsav's); a duplicate implementation #140 was merged and then reverted by #143 (human chose #137) |
| **Real Laya.** `laya-serve` with real weights produced the `pool_sf_city` tables (backend + ground truth) and a real-Laya sim run (`real_laya_center`, 20 seeds, 4 policies) plus the extraction eval. | #138; parsers #130, #131 |
| **Event-pool Laya tables skipped.** No real-Laya tables for `pool_evt_closer_together`; only `data/laya_tables/pool_sf_city` exists. | #138 ("Event pool tables skipped (human decision)") |
| **Pitch framing.** First, on fake-Laya evidence: "better than before, beats random" (the adopted params beat the old ones in all 25 cells and random by a wide margin, but trail greedy). With real Laya: "**includes the people others miss**, far better than random": Common Ground seats 92.7% of low-outgoing people at least once vs greedy 84.7%. Don't claim "beats greedy" (37.2% still isolated at week 8 vs greedy 33.3%, random 88.2%) or "best show-up" (greedy 58.3% vs 56.6%). The learning loop is presented as learning, not proven. | `HUMAN_TODO.md` §7 (d38e4ba, then #139 / db5c460) |
| **Native iOS only; desktop dropped.** The demo is judged on iPhones in Expo Go. Web stays on the mock for tests and reviews; the desktop layouts (for example Welcome's two-column view at ≥ 900 pt) are left in code but no longer maintained or reviewed. The UX audit scored native only. | (brief); [ux-audit.md](ux-audit.md), [e2e.md](e2e.md) |
| **Checkpoint B dropped.** The two-iPhone rehearsal checklist in [`CHECKPOINT_B.md`](../../../CHECKPOINT_B.md) was not run as a gate. Native was checked through the e2e flow review and the native UX audit instead. | (brief); [e2e.md](e2e.md), [ux-audit.md](ux-audit.md) |
| **Synthetic chat replies are templated.** Seeded counterparts answer with fixed lines because real Muse refuses to speak as a person. | #160; comment in `services/api/src/cg_api/synthetic/__init__.py` |
| **`thread.typing` cancelled for the demo freeze.** A realtime typing event for people (contracts v2.4.0) was approved and then cancelled; only Muse shows typing in the app. | #205 closed unmerged: "feature cancelled (demo freeze, per Ayush)" |
| **Public share page and stories (batch 5).** `getPublicPlan` (anonymous, counts only, no people), client-built share links, and an offer (never automatic) to post a completed meetup to the user's own story with the venue photo and title only. | Contracts v2.2.0 #125, v2.1.3; #129, #132, #133, #116, #119 |
| **Code freeze.** | (brief); last feature PR #202, docs only afterwards |

Not decided, so not listed: a Muse agent that uses tools (PRD-2). The scripted runner is what ships ([muse.md](muse.md)).
