# Perf and bugs: adversarial track (2026-11-13)

What the adversarial agents tried to break, what broke, and what was done about it. Each finding has a repro or measurement and a PR. Raw notes: `~/cg-orch/findings/adv-{backend,matching,app,privacy}.md` on the orchestrator laptop.

**Read the numbers with care.** Load average on the laptop was 580 to 800 for much of the session (simulators, Metro, Spotlight), so later before/after pairs are interleaved A/B runs. Wall-clock budget tests (`tests/perf/test_budgets.py`, `test_demo_graph::test_graph_and_metrics`) failed locally under that load and passed when run alone. GitHub CI is the judge for those.

## Privacy P1 to P11 (CONTRACTS §8)

Attacked through the public API on a private backend (`pool_sf_city`, fake Muse and Laya). The attack: onboard Maya, form a group with a private user (u_0125) and a public one (u_0144), dump every GET for three users, and grep for other users' hidden or sensitive interest IDs, signals, busy blocks and user IDs. Then IDOR every meetup, thread and approval route as an outsider, decline a payment, and block someone.

| Rule | Result | Evidence |
| --- | --- | --- |
| P1 overlap only | PASS, fallback fixed (#163) | Every interest ID in non-owner responses is in the viewer's own shown set. |
| P2 two-stage reveal | PASS | No other user IDs before formation. `sharedWithYou` is empty with 1 other person. Differencing crowd counts as people join is inherent to the spec. |
| P3 private profiles | **FAIL, fixed (#162)** | Name, initials, `avatarUrl: null` and the getPerson 403 were all correct, but the photo file itself was public. |
| P4 sensitive | **FAIL on fallback, fixed (#163)** | The live cg_matching path is fine: an un-hidden Laya-flagged interest never showed in 5 attackers' crowds. |
| P5 no enumeration | PASS | No list or search endpoint. Existence of a user ID can be probed (401 / 404-vs-403 / 400); this is accepted because demo identity has no auth in v2. |
| P6 invisible outcomes | PASS | A declined payment is invisible to the group. Approval messages are per user. Withdraw is silent and the leave note is dropped. |
| P7 owner-only | PASS | No signals, busy blocks or directives in other users' dumps. Directive titles are templates. The reschedule reply never says who is busy. |
| P8 no location | PASS | Check-in uses the reading for the answer only. Directions carry venue coordinates only. |
| P9 internal surface | **FAIL via browser, fixed (#167)** | Every internal path on the public listener returns 404/405. Blocks hide the other person both ways. |
| P10 data stays home | PASS | Outbound calls go only to Muse, Laya and Google free/busy. |
| P11 money and actions | PASS | Decline leads to pay at venue, with no "Paid" step. Re-deciding returns 409. Another user's approval returns 404. |

App client duties C1 to C8 were checked by code read; an on-device sweep (iOS 26.5, live backend, 60 s idle per screen) confirmed polling matches `config` cadence: C2, C3, C4, C5 and C7 PASS, and C1 has low items (see Open).

## Findings

| # | Area | Sev | Finding | Before → after | Status |
| --- | --- | --- | --- | --- | --- |
| PRIV-1 | backend | high | P3: `/static/avatars/u_0125.png` served a private user's photo to anyone. The URL is guessable from the userId in every PersonCard; 89 users in the pool are private. | 200 → 404 | [#162](https://github.com/ayushmk7/Meta-Closer-AI-Hackathon-2026/pull/162) merged |
| PRIV-2 | backend | med | P1/P4: `stubs._usable` ignored the per-user `sensitive` flag. matching falls back to stubs for anyone outside the snapshot (e.g. after opt-out), and `privacy._allowed` re-checked with the same function, so the leak got through. | Laya-flagged, shown, not-opted-in interest listed as shared → dropped | [#163](https://github.com/ayushmk7/Meta-Closer-AI-Hackathon-2026/pull/163) merged |
| PRIV-3 | backend | high | P9: the internal listener accepted any Host and Origin. A browser page could DNS-rebind to read `pools/{id}/export` (every user's hidden interests and home location) or CSRF `POST demo/reset`. | 200 / 204 → 403 / 403 | [#167](https://github.com/ayushmk7/Meta-Closer-AI-Hackathon-2026/pull/167) merged |
| BE-1 | backend | high | N+1: every feed card's `plan_overlap` and every person card's `shared_interests` exported and parsed the whole pool. `export` also scanned every pair for every user. | `plans.feed` with 4000 connections: 120.5 → 4.9 ms. 1000: 33.4 → 1.5. Empty: 7.4 → 0.5. | [#169](https://github.com/ayushmk7/Meta-Closer-AI-Hackathon-2026/pull/169) merged |
| BE-2 | backend | med-high | The rank cache was keyed on `len(w.events)`, so any chat message or Muse step to anyone triggered a whole-pool `rank_plans` (100-130 ms) on the event loop. | Recomputes after 1/2/3 chat-only events: 2/3/4 → 1 | [#171](https://github.com/ayushmk7/Meta-Closer-AI-Hackathon-2026/pull/171) merged |
| BE-3 | backend | med | Stale feed: profile edits (interests, visibility, setup, connectors, calendar) and blocks never moved the rank cache key. | u_0125 with all interests removed: still 8 plans → 0 | [#171](https://github.com/ayushmk7/Meta-Closer-AI-Hackathon-2026/pull/171) merged |
| BE-4 | matching | med | `rank_plans` had an O(users × met pairs) `iso` scan, plus repeated travel/busy work. | `iso` fixed on main (82b7d86). The rest measured about 1% (126 → 114 ms CPU, within noise). | No PR; the remaining ~100 ms needs a restructure |
| BE-5 | backend | med | Internal export, graph and metrics scanned every pair per user. The dashboard polls graph every 2 s and holds the GIL. | 4000 connections: export 100 → 5 ms, graph 48 → 4, metrics 39 → 0.3 | [#170](https://github.com/ayushmk7/Meta-Closer-AI-Hackathon-2026/pull/170) merged |
| MA-1 | matching | med | `form_groups` seat loop was O(n² × size): 565k `pair()` calls at 600 users. | 600 users: 579 → 141 ms. 400: 222 → 63. Output identical on 8 combos. | [#156](https://github.com/ayushmk7/Meta-Closer-AI-Hackathon-2026/pull/156) merged |
| MA-2 | matching | low-med | `candidates` recomputed both norms for every pair. | 600 users: 434 → 241 ms. 400: 189 → 101. | [#158](https://github.com/ayushmk7/Meta-Closer-AI-Hackathon-2026/pull/158) merged |
| MA-3 | backend | low | API formation reruns `candidates` (~180 ms) for every group formed. This runs once per plan, not per request. | n/a | Report only; revisit at about 1k users |
| MA-4 | matching | low | A NaN in LayaTables would make `min`/`sorted` order-dependent. `LayaTables` now raises on non-finite values. | n/a | [#164](https://github.com/ayushmk7/Meta-Closer-AI-Hackathon-2026/pull/164) merged |
| APP-1 | ios | high | A stale `getMeetup`/`listMeetups` response overwrote newer state (a lost realtime step, or an approval flipped back to pending). | `race.test.ts`: ['a'] → ['a','b']; 'pending' → 'approved' | [#154](https://github.com/ayushmk7/Meta-Closer-AI-Hackathon-2026/pull/154) merged |
| APP-2 | ios | med | Muse bar double-send (Enter + tap in one frame). In invite mode this created two meetups. | 2 calls → 1 | [#155](https://github.com/ayushmk7/Meta-Closer-AI-Hackathon-2026/pull/155) merged |
| APP-3 | ios | med | Chat unread badge stuck: `listThreads` raced `markThreadRead`. | unread 2 → 0 | [#157](https://github.com/ayushmk7/Meta-Closer-AI-Hackathon-2026/pull/157) merged |
| APP-4 | ios | high | A demo identity switch leaked Maya's Muse `conversationId` and chat messages into the next user's state. | 'cv_maya' → null | [#159](https://github.com/ayushmk7/Meta-Closer-AI-Hackathon-2026/pull/159) merged |
| APP-5 | ios | med | Identical polls re-rendered every reader (fresh arrays each time). | 5 Profiler commits for 5 identical polls → 0; on device, chat open 60 s: 12 renders → 0 | [#165](https://github.com/ayushmk7/Meta-Closer-AI-Hackathon-2026/pull/165) merged |
| BE-6 | backend | med | Nudge copy flipped between Muse's text and the template, because every `listNudges` asked Copy again. Fix: in DEMO_MODE a new nudge stays unseen until Muse's fill lands, then its copy is frozen. | Live, real Muse: text identical across 11 polls, each call 2-50 ms | [#175](https://github.com/ayushmk7/Meta-Closer-AI-Hackathon-2026/pull/175) merged |
| BE-7 | backend | med | P4/P7: a nudge stayed listed (signal label in `because`) after the user hid or deleted that signal. | Listed → gone | [#175](https://github.com/ayushmk7/Meta-Closer-AI-Hackathon-2026/pull/175) merged |
| BE-8 | backend | high | `advanceMeetup` to completed set start = now - duration, so "Sunday small plates" showed "FRI 3:12 AM". Fix: shift by whole days and rename the weekday in titles. | — | [#181](https://github.com/ayushmk7/Meta-Closer-AI-Hackathon-2026/pull/181) merged |
| BE-9 | sim | high | Only 2 of 105 seed venues had photos. Every non-sensitive venue now gets a stand-in. | Feed 8/8, shares 30/30, public plans all have `photoUrl` | [#182](https://github.com/ayushmk7/Meta-Closer-AI-Hackathon-2026/pull/182) merged |
| BE-10 | ios | med | The shared-plan hero was blank because `PublicPlan.tsx` read `venue.photoUrl`; the API sends a top-level `photoUrl`. | Blank → photo | [#184](https://github.com/ayushmk7/Meta-Closer-AI-Hackathon-2026/pull/184) merged |
| BE-11 | ios | high | No WebSocket or polling after an opt-in made outside the app: `realtime.ts` needs `me.optedIn`, but `me` loaded only at start. Fix: the tick reloads `me` while not opted in. | Unit test fails before, passes after (not run on a Simulator) | [#185](https://github.com/ayushmk7/Meta-Closer-AI-Hackathon-2026/pull/185) merging |

## Open (low priority)

- **userId in the WebSocket URL.** `/v1/ws?user=<userId>` is the contract (openapi `/v1/ws`), so uvicorn's access log records the identity. Changing it needs a contracts change.
- **Laya over plain HTTP on the LAN.** `LAYA_URL=http://<host>:8090` sends interest and place text unencrypted across the network. Fine on a trusted demo LAN; use TLS or a loopback tunnel otherwise.
- After a block, Muse's earlier intro message still names the blocked person. Their own messages are hidden.
- `setMyStatus` is still a spec-example fallthrough: it returns 200 with example data for any meetup ID. No real data leaks.
- App C1, demo only: the calendar `sig` stores directive title, location and notes in AsyncStorage (own data, never other people's names). Quest logs are keyed by userId, and drafts survive an identity switch.
- App gen-check gap, skipped by orchestrator decision (demo only, short windows): `join`, `optIn`, the `dismissNudge` rollback and `likeShare` write after an identity switch. Needs about 4 per-action `if (g !== gen) return` checks.
- With no socket, the Meetup screen (setting_up) and the Plan pop-up (gathering) poll the same object as `pollFast`: 2 requests per interval. Since #165 these cost requests only, not renders.
- "211 min by transit" came from the event pool being primary: Maya's pinned featured plans skip the travel filter by design. With SF primary they are 13-32 min. Remaining ios item: hide unmet checks on the card.
- e2e-fable #14 (typing event) needs a contracts change and is not needed for the demo.
- `World.events` grows without bound (about 94 B per event). `World.centroid` scans all users per card (~0.1 ms). Neither matters at demo length.
- The remaining `rank_plans` cost (~100 ms, spread over 54k user × plan pairs) runs on the event loop. Reducing it needs a restructure.
