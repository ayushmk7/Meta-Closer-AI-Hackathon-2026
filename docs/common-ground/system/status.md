# Status: demo freeze (2026-11-13)

Where the project stands on the day of the demo: what is merged, what runs where, how to get from a cold laptop to a working demo, what is real and what is synthetic, and what is still open. Sources: `git log origin/main`, `gh pr list --state merged --limit 250`, `gh pr list --state closed`, the other pages in this folder, and the processes listening on the demo laptop (`lsof -iTCP -sTCP:LISTEN`), read on 2026-11-13.

Exact commands live in [runbook.md](runbook.md); human-only steps in [`HUMAN_TODO.md`](../../../HUMAN_TODO.md). This page links to them and does not repeat them.

## At a glance

| What | State |
| --- | --- |
| Code | **Frozen for the demo.** Only docs PRs merge from here. |
| `main` | `1f4444f`, merge of #204 (UX audit final score), 2026-11-13 10:34 -05:00 |
| Merged PRs | 201 (#1 to #204, minus #1, #2, #60 and #205) |
| Open PRs | None except the four parallel docs PRs (this one plus backend/runbook/HUMAN_TODO, laya/sim/matching-ml, app/muse/decisions) |
| Closed unmerged | #1 and #2 (early v1 milestones, superseded by v2), #60 (learning-loop tuning: no robust winner, see #58), #205 `thread.typing` (closed 15:34Z because of the freeze) |
| Feature name | **Meetups** in every user-facing string (renamed from Plans in #144 to #148, #150, #152). "Common Ground" remains the internal/code name. |
| Design review | Uniformity 9.0, UX 9.0 on native iOS (from 7.0 / 6.9): [ux-audit.md](ux-audit.md) |
| Flow review | Flow 9, motion 9 on native iOS (from 6.5 / 6): [e2e.md](e2e.md) |
| Adversarial review | Privacy P1 to P11 all PASS after 3 fixes; perf and race bugs fixed: [perf-and-bugs.md](perf-and-bugs.md) |

## History

### Core build (2026-11-12, #3 to #35)

| Track | PRs | What landed |
| --- | --- | --- |
| Contracts v2 | #12, #15, #20, #24 | Plans-first Common Ground with a visible Muse agent; web header tab, `stepDelayS`, timezone, horizon anchor; optional `plan_overlap` params; `Me.rewards`, Surprise me client-only |
| Backend | #14, #16, #17, #18, #19, #26, #28, #33, #34, #35 | Skeleton; plans domain and ScriptedRun driver; Laya and Muse clients, scripted planner, askMuse; store, seed load, setup, connectors, calendar, export; rewards; perf budgets at 400 people / 600 plans; synthetic counterparts answer approvals (Checkpoint A); calendar directives |
| Matching | #13, #19 | `cg_matching` v2 (ranking, grouping), pure `plan_overlap` path |
| App | #8, #9, #10, #11, #25, #27, #29 | Types, API, mock, store, routes; meetup and chat; Plans home, plan pop-up, setup, settings; realtime, calendar sync, leave-by reminders; Surprise me; Rewards |
| Shell | #6 | Calendar and notifications deps, permission strings |
| Sim | #3, #4, #5, #7, #21, #22, #23, #30 | Dashboard on `127.0.0.1:9100`; seed v2 (both pools, Maya, `demo.json`); Laya golden renderer and tables; Monte Carlo (3 policies, 5x5 sweep) moved onto the real `cg_matching` |

### Batches (2026-11-13)

| Batch | PRs | What landed |
| --- | --- | --- |
| Batch 2: social loop | #36 to #55 | Shares, in-person verify (QR show/scan), feedback rating, feedback into prefs, Welcome and Explore gallery, Quests and Passport, `Me.unlocks`, askMuse fully live, `reunionBoost`/`crowdBoost`, Google Calendar connector fixture |
| Batch 3: isolation | #42, #56, #58, #59, #61 to #63, #75 to #77 | Learning-loop policy in the sim; `fillToMax`, `reunionBoost`, `crowdBoost` grids (none passed alone); adopted together in #75 (`fillToMax`, `reunionBoost 1`, `crowdBoost 0.5`) |
| Muse off the request path | #64, #65, #66 | Copy re-asked on read; live Muse moved to a background cache (feed under 500 ms); extraction cache split by Muse mode; precompute script |
| UX uniformity, rounds 1 to 3 and polish | #67 to #99 | One voice in server and Muse copy, a11y, naming, photos, back rows, approval copy in Muse's third person (#85 to #90) |
| Batch 4: motion and polish | #100 to #124 | Final demo decisions (#100); demo labels flagged in data, not rendered (#102); motion helpers (`PressScale`, `Skeleton`, `Pop`, `MuseThinking`); Muse thinking checklist and typing; `headerAction` in the shell top bar; post to my own story (`usePostStory`); Passport postmark stamps; **Little Fern Kitchen demo nudge** (#117, #120, #121) |
| Batch 5: public plans and tables | #125 to #135, #149 | `getPublicPlan` and the logged-out shared meetup page (v2.2.0); `features.sharing`; Sun 7 PM table nudge and venue photos; demo labels dropped from plan descriptions; review fixes |

### Real model peers and live calendar

| PR | What |
| --- | --- |
| #130, #131 | Backend and sim parse the real `laya-serve` answer fields (`noul`, index-keyed scores). Before this, every real Laya answer fell back. |
| #136, #137 | Contracts v2.3.0 and backend: **live Google Calendar free/busy**, linked on the laptop, replaces Maya's seeded busy blocks when `CONNECTORS_LIVE=1` |
| #140, #143 | A duplicate live-calendar implementation (#140) merged and was reverted by #143, keeping #137 |
| #138 | Real Laya tables for `pool_sf_city` and a real-Laya sim run (`data/sim/runs/real_laya_center`) and eval |
| #139 | Pitch numbers in `HUMAN_TODO.md` replaced with the real-Laya run (see [Pitch numbers](#pitch-numbers)) |

### Meetups rebrand and the faux call

| PR | What |
| --- | --- |
| #144 | Shell strings |
| #145 | Contracts and docs strings |
| #146 | Native app strings |
| #147 | Sim pool descriptions |
| #148 | Backend copy |
| #150 | `fixtures.json` regenerated |
| #152 | Backend tests: unlock labels follow the rebrand |
| #151 | **Faux call**: Muse calls the restaurant to reserve. UI only, keyed off a step label starting `Reserved a table` |
| #153 | For you: every meetup card the same size |

### Remote tracks on a teammate's Mac (#154 to #204)

The last 51 merged PRs (#154 to #204) came from an orchestrator running three tracks on a teammate's Mac (branch prefix `cg/*`, one author). All merged on 2026-11-13 before the freeze.

| Track | Result | Main PRs (by branch name) | Page |
| --- | --- | --- | --- |
| **ux** (Fable inspector scoring native screenshots) | Uniformity **9.0**, UX **9.0** on native iOS, up from 7.0 / 6.9, over 13 scoring passes | #166, #168, #176, #177, #180, #183, #193, #197, #200 to #204 | [ux-audit.md](ux-audit.md) |
| **adversarial** (privacy, perf, races) | P3, P4 (fallback) and P9 failed and were fixed; the rest PASS. Perf and race fixes below. | #154 to #159, #162 to #165, #167, #169 to #172, #175, #181, #182, #184, #185 | [perf-and-bugs.md](perf-and-bugs.md) |
| **e2e** (full flow on native, motion bursts) | Flow **9**, motion **9**, up from 6.5 / 6; `scripts/e2e_flow.py` walks the flow through the API | #160, #161, #173, #174, #178, #179, #186 to #192, #194 to #196, #198, #199 | [e2e.md](e2e.md) |

Headline adversarial fixes:

| PR | Fix | Measured |
| --- | --- | --- |
| #156 | `form_groups` seat loop keeps each waiting person's min pair score incrementally | 600 users: **579 → 141 ms** (400: 222 → 63); outputs identical on 8 pool/size combos |
| #158 | `candidates` computes each user's vector norm once | 600 users: **428 → 231 ms** (400: 188 → 102), per the PR body; perf-and-bugs.md records a second run of 434 → 241 |
| #169 | Feed overlap exports only the compared users | `plans.feed` with 4000 connections: 120.5 → 4.9 ms |
| #170 | Internal export/graph/metrics index pairs once | export 100 → 5 ms, graph 48 → 4, metrics 39 → 0.3 |
| #171 | Rank cache keyed on a version counter, not `len(events)` | chat messages no longer re-rank the pool; profile edits no longer serve a stale feed |
| #154 | Drop stale meetup fetches | steps and decided approvals never revert |
| #155 | Muse bar sends once when Enter and the send tap land in one frame | 2 calls → 1 (invite mode had made two meetups) |
| #157 | Opening a chat clears its unread badge even if the thread list answers last | unread 2 → 0 |
| #159 | In-flight Muse asks and chat sends never land in the next identity | `conversationId` no longer leaks across a demo identity switch |
| #162, #163, #167 | Privacy: private users' avatars off `/static` (P3); stub fallback respects Laya's sensitive flag (P4); internal API rejects non-loopback Host/Origin (P9) | 200 → 404; leak → dropped; 200/204 → 403 |
| #181, #191 | `advanceMeetup` keeps the time of day and weekday, and moves the plan with its meetup | "Sunday" no longer shows as "FRI 3:12 AM" |

### Full table of merged PRs

All 201 merged PRs, grouped by area. The area is the title prefix, or the branch's `cg/<area>/` segment when the title has none. Matching PRs sit under backend, which owns `packages/matching`.

### Contracts and docs (`[contracts]`): 33

| PR | Title |
| --- | --- |
| #12 | v2: plans-first Common Ground with a visible Muse agent |
| #15 | v2 decisions: web header tab, stepDelayS, timezone, horizon anchor |
| #20 | plan_overlap: optional kw-only params |
| #24 | optional Me.rewards; Surprise me is client-only |
| #39 | batch 2: shares, verify, feedback rating, luma/beli, prefs |
| #53 | listConnectors example includes google_calendar |
| #57 | HUMAN_TODO.md |
| #59 | params: reunionBoost and crowdBoost (off by default) |
| #63 | params: matching.fillToMax (off by default) |
| #75 | adopt isolation params (fillToMax, reunionBoost 1, crowdBoost 0.5) |
| #85 | payment approval example in Muse third person |
| #89 | approval examples match server copy verbatim |
| #100 | record final demo decisions |
| #102 | demo labels: flagged in data, not rendered |
| #106 | CHECKPOINT_B.md checklist; HUMAN_TODO status |
| #109 | optional TabItem.headerAction (v2.1.2) |
| #113 | system docs: backend, ML, Muse, Laya, sim, app, runbook |
| #114 | usePostStory: post a completed meetup to my own story (v2.1.3) |
| #121 | Docs: Little Fern Kitchen demo nudge |
| #125 | v2.2.0: getPublicPlan + PublicPlan, features.sharing |
| #126 | Nudge venue (batch 5): "free" → "no payment approval" |
| #136 | v2.3.0: live Google Calendar (free/busy, laptop-linked) |
| #139 | HUMAN_TODO: pitch from real-Laya sim |
| #145 | Rebrand Plans -> Meetups: contracts/docs strings |
| #161 | scripts/e2e_flow.py: walk the full demo flow through the API |
| #172 | docs: adversarial track findings (perf-and-bugs.md) |
| #173 | docs: end-to-end flow page (system/e2e.md) |
| #179 | e2e_flow.py: fail fast on a used backend, document the reset precondition |
| #187 | docs: e2e.md review status and closed gaps |
| #195 | docs: e2e.md scores on main after the motion fixes |
| #198 | docs: e2e.md final review status (flow 9, motion 9) |
| #203 | docs: UX audit (uniformity 9.0, UX 9.0 on native; method, measurements, before/after) |
| #204 | docs: UX audit: final score read from the clean native set; open items |

### Backend and matching (`[backend]`): 54

| PR | Title |
| --- | --- |
| #13 | cg_matching v2 (slice B: matching) |
| #14 | v2 M0 skeleton |
| #16 | C plans domain M1: domain, routes, matching adapter, ScriptedRun driver |
| #17 | D M1: Laya, Muse client/copy/extraction, scripted planner, askMuse |
| #18 | slice A M1: store, seed load, setup, connectors, calendar, export |
| #19 | cg_matching: pure plan_overlap path, safe Params.default() |
| #26 | Rewards |
| #28 | A: perf budgets at 400 people / 600 plans |
| #31 | C: Copy gets CopyInterest (tests), refund then cancel verified with #17 |
| #33 | C: Checkpoint A: synthetic counterparts via World.on_approval, live failNextBooking (supersedes #34's need) |
| #34 | D: synthetic counterparts answer approvals (Checkpoint A stall) |
| #35 | syncCalendar: directives from joins and meetups |
| #36 | C: Checkpoint A walk fixes: nudges, toMuse reschedule, LAN avatars, formation beat |
| #38 | cg_matching prefs (feedback loop) |
| #40 | A: frequent_place label in R12 voice; bridge aliases World.nudges |
| #44 | D: toMuse slot offer is actionable (uxback #36 minor) |
| #47 | C batch 2 slice 8: shares, verify, real checkIn/sendFeedback, feedback -> prefs |
| #50 | D: askMuse fully live (filters, closest match, share promptText) |
| #51 | cg_matching reunionBoost + crowdBoost |
| #52 | C known gaps: createPlan live; caption name variants (already on main) |
| #54 | A: Me.unlocks and capabilities from counted meetups |
| #61 | cg_matching fillToMax (fewer, fuller groups) |
| #64 | C: re-ask Copy on each read (Muse text replaces the template) |
| #65 | D: live Muse off the request path (feed < 500 ms) |
| #66 | A: extraction cache split by Muse mode; precompute script |
| #69 | UX uniformity: server copy (slice C) |
| #71 | UX uniformity: Muse copy and step labels |
| #74 | UX uniformity: server copy follow-ups (slice C) |
| #76 | cg_matching tests for isolation params (#75) |
| #86 | D: payment approval copy in one voice (Muse, third person) |
| #120 | Restaurant-aware booking copy (Little Fern Kitchen) |
| #128 | Table copy details + tiny seed (batch-5 B2) |
| #130 | Laya: parse real laya-serve answer fields (noul, index-keyed scores) |
| #132 | getPublicPlan: anonymous public plan view |
| #135 | Drop demo label from tiny seed plans |
| #137 | live Google Calendar: link on the laptop, free/busy replaces seeded busy |
| #140 | Live Google Calendar free/busy (contracts #136) |
| #143 | revert #140 (keep Utsav's #137 for live Google Calendar) |
| #148 | Rebrand Plans -> Meetups (backend copy) |
| #152 | tests: unlock labels follow the Meetups rebrand |
| #156 | matching: form_groups seat loop 4x faster at 600 people (outputs identical) |
| #158 | matching: candidates computes vector norms once per user (1.8x at 600 people) |
| #160 | Synthetic counterparts reply in the group chat |
| #162 | P3: stop serving private users' avatars from /static |
| #163 | P4: stubs overlap drops Laya-flagged interests that weren't opted in |
| #164 | matching: LayaTables rejects non-finite probabilities |
| #167 | P9: internal API rejects non-loopback Host/Origin (DNS rebinding, CSRF) |
| #169 | Feed overlap: export only the compared users, index pairs once |
| #170 | Internal export/graph/metrics: index pairs once |
| #171 | Rank cache: version counter instead of len(events) (perf + stale-feed fix) |
| #175 | Nudges: Muse's wording, never swaps once served; hide when its signal is hidden (P4) |
| #181 | advanceMeetup: keep the time of day and the title's weekday true (meetup date bug) |
| #191 | advanceMeetup: move the plan with its meetup (same day everywhere) |
| #192 | api: plan descriptions describe the activity (create_plan + tiny seed) |

### App (`facebook-clone` feature, `[ios]`): 74

| PR | Title |
| --- | --- |
| #8 | A1: v2 core (types, api, mock, store, stubs, routes) |
| #9 | C: meetup + chat (v2) |
| #10 | B: Plans home, plan pop-up, setup, settings |
| #11 | A2: staged mock, realtime, calendar sync, leave-by reminders |
| #25 | Fix main's native tests: mock react-native-maps in slice B suites |
| #27 | Surprise me |
| #29 | Rewards |
| #41 | B1: batch-2 core (shares, verify, routes, stubs, placements) |
| #43 | b2-verify: QR show/scan, VerifyButton, FeedbackExtras |
| #45 | B2 slice 3: Welcome, Explore gallery, ShareCard, IdeasRow, ShareMeetup |
| #46 | Quests and Passport |
| #48 | #41 review fixes + anonymous listShares |
| #55 | fixtures: Google Calendar connector |
| #67 | UX uniformity: Rewards, Quests, Passport |
| #68 | UX uniformity: meetup, chat, verify |
| #70 | UX uniformity: shared ui, copy, not-found |
| #72 | UX uniformity: Plans, plan pop-up, setup, settings, gallery |
| #73 | UX uniformity: Pill a11y follow-up |
| #78 | UX final: Meetup first names, single going count |
| #79 | UX final: Welcome focus, ShareCard reactions row |
| #81 | UX r2: Quests, Passport, Surprise me |
| #82 | UX round 2: meetup, chat, verify |
| #83 | UX round 2: Plans naming, plan states, Surprise placement, setup |
| #84 | UX round 2: photos, web back row, naming, nudge, seeded progress |
| #87 | fixtures: approval voice |
| #90 | fixtures: approval example truth |
| #91 | UX final2: chat header and web venue row |
| #92 | UX round 3: Plan map tile, demo footnote, share avatars, wording |
| #93 | UX r3: Quests |
| #94 | UX round 3: meetup, chat, verify |
| #96 | UX round 3: back row, avatar lock, Home header, share photos |
| #97 | Polish: web Directions link on the meetup address |
| #98 | Final polish: reason checkmarks, web Calendar label |
| #99 | final polish: share photo, See plan, Maya's photo |
| #101 | mock: Muse bar filters plans by keyword |
| #103 | motion helpers: PressScale, enter, Skeleton, Pop, MuseThinking |
| #105 | rewards: stamp and quest pops, animated progress |
| #107 | Muse thinking checklist, staggered plans, no demo labels |
| #108 | meetup pops, Muse typing, call teaser, no demo labels |
| #112 | Plans: gear in shell top bar, drop in-screen Plans row (native) |
| #115 | Passport: postmark stamps, cover card, share own stamps |
| #119 | After-meetup Story prompt: add it to my story in one tap |
| #122 | Batch 4 review fixes: teaser row, skeleton height, typing dots, pop on change, Muse hold |
| #124 | Passport share hidden unless features.sharing |
| #129 | getPublicPlan client, mock route, share links (batch 5 I1) |
| #133 | Share buttons and the public plan page (batch 5 I2) |
| #142 | Setup: each step opens at the top |
| #146 | Rebrand Plans to Meetups (native app strings) |
| #149 | Common Ground: batch 5 review fixes (#1-#5) |
| #150 | Regenerate fixtures.json after Meetups rebrand |
| #151 | Faux call: Muse calls the restaurant to reserve (UI only) |
| #153 | For you: every meetup card the same size |
| #154 | Drop stale meetup fetches so steps and decided approvals never revert |
| #155 | Muse bar sends once when Enter and the send tap land in one frame |
| #157 | Opening a chat clears its unread badge even if the thread list answers last |
| #159 | Muse asks and chat sends in flight never land in the next identity |
| #165 | Identical poll results no longer re-render Common Ground screens |
| #166 | Common Ground: align type and color with shell tokens |
| #174 | Logged-out header clears the status bar; completed meetup reads "Muse set this up" |
| #176 | Meetups home + cards: one card geometry, visible passport, 44pt toggles |
| #177 | Common Ground Welcome: header role on section titles; no card shadow in dark |
| #178 | Plan page follows join.updated; "Group size · 4" when min = max |
| #180 | Plan pop-up, Chat, Meetup, Explore: one header anatomy, one-row footer, map follows app theme |
| #183 | Chat composer in one row; one Muse speech bubble style |
| #184 | Shared meetup hero: use PublicPlan's top-level photoUrl |
| #185 | Realtime: pick up an opt-in made outside the app (no socket, no polls) |
| #186 | Motion for Common Ground processes (join, group set, steps, call, chat) |
| #188 | Chat: one bar on native; thread header scrolls as the first item (N-P1-1) |
| #189 | Setup and log-in motion (fade, step slide, Muse thinking) |
| #193 | Setup step 1 fits; a missing chat says so once; Ideas one card per venue |
| #196 | Call pacing: hold later steps, 'Reserving…' while calling, no jump at confirm |
| #199 | Scroll the approval step and its card into view |
| #201 | Common Ground: visible switch off track; passport empty state; missing code says it once |
| #202 | Meetups pushed screens name themselves in the shell bar; one title per screen; Passport share in the hero |

### Shell (`[shell]`): 17

| PR | Title |
| --- | --- |
| #6 | v2 M0: calendar + notifications deps, permission strings, sparkles web icon |
| #37 | batch 2: expo-camera + qrcode-generator |
| #49 | no tab chrome or badge hooks on logged-out Welcome |
| #80 | web: RN-web Switch tracks visible again |
| #88 | UX uniformity: Sheet dialog and mobile web active tab |
| #95 | UX uniformity: bottom sheet below 600px, Plans first in Menu |
| #104 | Sheet slides up (reduce-motion aware) |
| #110 | tab title + headerAction in top bar for contributed tab roots |
| #111 | Marketplace photos on phone |
| #116 | usePostStory: post to my own story from Common Ground |
| #118 | usePostStory: lazy-load the photo module |
| #123 | Boot spinner drops the "Opening your demo…" line |
| #141 | Top bar tab title: line height so "Plans" isn't clipped |
| #144 | Rebrand Plans to Meetups: shell |
| #168 | ux: 44pt tap targets for shell Button and Chips |
| #197 | Contributed tabs can name their pushed routes in the top bar |
| #200 | Shell: primary Button fill c.brand; visible off track on Settings switches |

### Sim and data (`[sim]`): 23

| PR | Title |
| --- | --- |
| #3 | M2 dashboard: four pages on 127.0.0.1:9100 |
| #4 | M0 seed v2: scaffold + both pools, all 7 seed files, Maya, demo.json |
| #5 | M1 laya: golden renderer, extraction eval, precompute tables |
| #7 | M2 Monte Carlo: 3 policies, 5x5 sweep, REPORT.md, replay.json |
| #21 | M3: real cg_matching, delete matching fallback |
| #22 | seed: Leiden scene ids on curated demo plans |
| #23 | tests: re-pin mc toy regression for real cg_matching |
| #30 | M3 Monte Carlo on real cg_matching: REPORT.md, caps finding |
| #32 | mc: exploratory CG params grid on real cg_matching |
| #42 | B6 sim-learn: common_ground_learned policy (update_prefs) |
| #56 | b3 isolation: cands fix, reunion diagnostic, reunionBoost/crowdBoost grid (none pass) |
| #58 | mc: tune the learning loop — no robust winner (held-out) |
| #62 | b3 round 2: fillToMax grid (none pass) |
| #77 | re-pin toy regression for isolation params (#75) |
| #117 | Demo nudge: Little Fern Kitchen dinner reservation |
| #127 | Nudge Sun 7 PM table + demo venue photos |
| #131 | Laya: parse real laya-serve answer fields (noul, index-keyed scores) |
| #134 | Drop demo label from plan descriptions |
| #138 | real Laya tables + real-Laya sim run and eval |
| #147 | sim: rebrand pool descriptions to Meetups |
| #182 | Venue photos for every non-sensitive venue (no empty blue blocks) |
| #190 | sim: plan descriptions describe the activity, not time/place/price |
| #194 | sim: food_crawl plan copy matches single-venue plans |

## What runs where (demo laptop)

Confirmed listening on the demo laptop on 2026-11-13 (`lsof`): `:8090`, `:8000` (all interfaces), `:9001` (loopback), `:8081`.

| Piece | Where | How it is configured |
| --- | --- | --- |
| **Laya** (`laya-serve`, the local probability model) | `:8090`, bound to `0.0.0.0` | Real weights, `LAYA_MODEL=laya`. See [laya.md](laya.md). |
| **Backend** (`services/api`) | public `:8000` (REST and WS `/v1/ws`, all interfaces); internal `:9001` (loopback only) | `DEMO_MODE=1 MUSE_FAKE=0 LAYA_FAKE=0 LAYA_URL=http://127.0.0.1:8090 LAYA_MODEL=laya CONNECTORS_LIVE=1`. See [backend.md](backend.md). |
| **Muse** (Meta's LLM API) | `api.meta.ai`, model `muse-spark-1.3` | Real calls, kept off the request path by a background cache. See [muse.md](muse.md). |
| **Google Calendar** | Google free/busy API | Live for `u_maya` only, linked once in the laptop browser; token in `services/api/.cache/tokens/` (gitignored) |
| **Metro** (Expo bundler) | `:8081` | `facebook-clone/.env`: `EXPO_PUBLIC_CG_API_URL=http://<LAN IP>:8000`, `EXPO_PUBLIC_CG_USER=u_maya`, `EXPO_PUBLIC_CG_MOCK=0`. See [app.md](app.md). |
| **App** | iPhone via Expo Go, or the iOS Simulator | Same network as the laptop |
| Dashboard (optional) | `127.0.0.1:9100` | Not needed for the demo. See [sim.md](sim.md). |

Exact start commands: [runbook.md](runbook.md).

## Demo-day checklist

Do these in order. Commands are in [runbook.md](runbook.md).

1. **Start Laya** on `:8090` with the real weights and check one `POST /v1/systemone` answers.
2. **Start the backend** with the env in the table above. The startup log names both providers (`providers: muse ..., laya ...`).
3. **Load only `pool_sf_city`.** The pool loaded last becomes primary. Loading `pool_evt_closer_together` after it makes the event pool primary: the feed top becomes `pl_evt_hero_lunch_walk` instead of `pl_sf_hero_wheel`, the nudge changes, and Maya's featured plans show long transit times. If that happens, load `pool_sf_city` again.
4. **Point the app at the laptop.** `ipconfig getifaddr en0`, put that IP in `EXPO_PUBLIC_CG_API_URL` in `facebook-clone/.env`, then restart Metro with `--clear`. Env values are inlined at bundle time: a stale IP shows **"That took too long. Try again."** on the phone (the client timeout in `facebook-clone/src/features/common-ground/api.ts`).
5. **Reload the app** (⌘R in the Simulator, or shake and Reload in Expo Go).
6. **Tap Allow on notifications** on every demo phone beforehand. Otherwise the permission alert appears over the screen at the moment the meetup confirms (first leave-by reminder).
7. **Hide Expo Go's floating tools button** so it is not in the shot.
8. **Smoke test** as Maya:
   - the feed loads, with the hero `pl_sf_hero_wheel` near the top;
   - join the hero; the group forms;
   - approve the payment;
   - the meetup reaches confirmed with 8 Muse steps and the booking booked;
   - send a chat message; a reply lands in about 4 s.

   `python3 scripts/e2e_flow.py` walks the same path through the API, but it needs a fresh `u_maya` and `--reset` wipes every user: only run it against a private backend on other ports ([e2e.md](e2e.md)).

### Demo flow script

| # | Beat | What to show |
| --- | --- | --- |
| 1 | Logged-out Welcome | The anonymous gallery of shared meetups |
| 2 | Setup | Mode, connect apps, what Muse picked up, preferences |
| 3 | Calendar | Live Google Calendar free/busy replaces Maya's seeded busy blocks |
| 4 | Meetups home | Muse bar, the **Little Fern Kitchen** nudge, For you, **Surprise me** |
| 5 | Join | Tap I'm in on the hero; "You're in." |
| 6 | Gathering | People join; counts only until the group forms |
| 7 | Group | The group is set; names and shared interests appear |
| 8 | Muse steps | Muse sets it up step by step, including the **faux call** to the restaurant |
| 9 | Approval | The payment approval sheet; approve |
| 10 | Confirmed | The timeline collapses to one summary row |
| 11 | Chat | Group chat; synthetic attendees reply; Muse typing after an Ask Muse message |
| 12 | Verify | In-person verify by QR |
| 13 | After | Feedback, share, post to my story, passport stamp |

The call (beat 8) and the approval (beat 9) are on different meetups: see [Known gaps](#known-gaps).

## Real vs synthetic

| Real | Synthetic |
| --- | --- |
| **Muse** (`muse-spark-1.3`): extraction, copy, nudges, Ask Muse, chat replies when it answers in time | **Personas**: every user except Maya is seeded (`data/seed/<pool>`), including names, photos and interests |
| **Laya** (`laya-serve`, real weights): sensitivity, join, show-up and meet-again probabilities; precomputed tables for `pool_sf_city` | **Other attendees**: their joins, approvals and chat messages are scripted by the backend (synthetic counterparts) |
| **Google Calendar free/busy** for Maya (`CONNECTORS_LIVE=1`) | **Bookings**: no venue is contacted |
| The app, backend, matching and realtime are real code running live | **Payments**: nothing is charged; the approval moves a status only |
| | **The call**: the faux restaurant call is UI only (#151) |
| | **Chat replies**: templated when Muse times out |
| | Other connectors (Maps, Luma, Beli) are seeded records |

The data still flags simulated records; the app no longer renders demo labels (#102, #107, #108). Say so in the pitch.

## Pitch numbers

From `HUMAN_TODO.md` (#139), sim run `real_laya_center` (#138: real Laya tables, 20 seeds, center cell): Common Ground seats **92.7%** of low-outgoing people at least once vs greedy 84.7%, and leaves 37.2% still isolated at week 8 vs greedy 33.3% and random 88.2%. Pitch "includes the people others miss, far better than random". Do not claim "beats greedy" or "best show-up" (greedy 58.3% vs Common Ground 56.6%). The learning loop shows no measurable gain. Details: [sim.md](sim.md), [matching-ml.md](matching-ml.md).

## Known gaps

From [e2e.md](e2e.md), [perf-and-bugs.md](perf-and-bugs.md) and the committed data, on `1f4444f`:

| Gap | Impact on the demo |
| --- | --- |
| The **Little Fern Kitchen** meetup has the faux call but no payment approval; the **hero** (`pl_sf_hero_wheel`, a prepaid $35 wheel-throwing drop-in) has the approval but no call. One meetup does not show both beats. | Demo both meetups, or narrate one beat |
| Only Muse shows typing. People typing needs `thread.typing`, which was proposed in #205 and closed unmerged for the freeze. | None if not mentioned |
| At approval and at confirmed, "Open group chat" toggles primary/secondary a few times and a "Private event" row pushes the avatars down. | Small visual jump |
| The notification permission alert appears at confirm if not granted beforehand. | Checklist step 6 |
| The in-app mock goes from interested to matched in one tick. | Only the live backend shows people joining one by one |
| Synthetic chat lines fall back to templates when Muse times out. | Replies read flatter |
| `useReducedMotion()` is read once at launch. | Toggling Reduce Motion needs an app restart |
| Never seen on native in review: the approval sheet, verify, feedback and story cards (covered by `scripts/e2e_flow.py` only). | Rehearse these on a phone |
| **Sim ground truth for the event pool is still fake Laya**: `data/sim/laya_gt/pool_evt_closer_together/manifest.json` says `"layaModel": "fake"`; `pool_sf_city` says `"laya"`. There are no committed `data/laya_tables/pool_evt_closer_together` tables. Older runs in `data/sim/runs/` (all but `real_laya_center`) also used fake tables. | Quote only the `real_laya_center` numbers |
| Open low-priority items: userId in the WS URL, Laya over plain HTTP on the LAN, remaining ~100 ms `rank_plans` on the event loop, unbounded `World.events` | None at demo length; see [perf-and-bugs.md](perf-and-bugs.md#open-low-priority) |

## After the hackathon

| Do | Why |
| --- | --- |
| **Rotate the Muse API key** | It was shared in chat during the hackathon |
| **Rotate the Google OAuth client secret** | Same |
| **Revoke the Google Calendar token**, and delete `services/api/.cache/tokens/` | The linked account's free/busy token sits on the demo laptop |
| Delete or rotate anything else in `.env` | Demo-only values |
| Pick up the open items above | Typing for people (#205), one meetup with both call and approval, real Laya ground truth for the event pool |

## Other pages

[README.md](README.md) indexes every system doc. Also: [backend.md](backend.md), [matching-ml.md](matching-ml.md), [muse.md](muse.md), [laya.md](laya.md), [sim.md](sim.md), [app.md](app.md), [runbook.md](runbook.md), [decisions.md](decisions.md), [`CHECKPOINT_B.md`](../../../CHECKPOINT_B.md).
