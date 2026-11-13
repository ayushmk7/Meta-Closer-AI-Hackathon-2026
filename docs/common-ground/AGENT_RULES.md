# Agent rules

Four agents build Common Ground in parallel, each in its own worktree, merging through PRs. These rules let each one make its own best choices without breaking the others or needing updates from them. Follow them exactly; inside them, decide freely.

Read first: [contracts/CONTRACTS.md](../../contracts/CONTRACTS.md), then this file, then your PRD. [DESIGN.md](DESIGN.md) explains the why. Precedence when they disagree: contracts > these rules > your PRD > DESIGN.

| Agent | PRD | Builds |
| --- | --- | --- |
| **ios** | [PRD-1](PRD-1-ios-common-ground.md) | The Common Ground feature inside the Expo app: Plans tab (Muse bar, plan carousel, Your plans), plan pop-up, setup and connectors, meetup timeline and approvals, chat, calendar sync, reminders |
| **backend** | [PRD-2](PRD-2-backend-ai.md) | Public and internal APIs, Muse (bar, agent, chat), Laya, `cg_matching`, simulated connectors, booking and payments, synthetic counterparts |
| **sim** | [PRD-3](PRD-3-simulation-dashboard.md) | Seed data (personas, activity, connector records, venues, plans), Laya precompute, Monte Carlo simulation, backend-only dashboard |
| **shell** | [PRD-4](PRD-4-facebook-shell.md) | Small changes to the Facebook clone so Common Ground plugs in |

## R1. Ownership

You write only inside your paths. Reading anything is fine. CI enforces this with `scripts/check_ownership.py`.

| Agent | Branch prefix | May write |
| --- | --- | --- |
| ios | `cg/ios/` | `facebook-clone/src/features/common-ground/**`, `facebook-clone/src/app/common-ground/**`, `facebook-clone/assets/common-ground/**`, `facebook-clone/tests/common-ground/**` |
| backend | `cg/backend/` | `services/api/**`, `packages/matching/**` |
| sim | `cg/sim/` | `services/sim/**`, `services/dashboard/**`, `data/**` |
| shell | `cg/shell/` | `facebook-clone/**` except the ios paths |
| human | `cg/contracts/` | `contracts/**`, `docs/common-ground/**`, `scripts/**`, `.github/**`, root files |

- Each Python project (`services/api`, `packages/matching`, `services/sim`, `services/dashboard`) has its own `pyproject.toml` and lockfile. There is no shared Python lockfile, so dependency changes never conflict.
- The app has one `package.json`, owned by shell. ios never edits it; the dependencies ios needs are pre-installed from the allowlist in CONTRACTS §11.
- Allowed cross-boundary imports, read-only: sim and dashboard import `cg_matching` (path dependency on `packages/matching`). ios imports the clone's public exports (`@/core/store` `useDemo`, `@/ui/native`, `@/ui/tokens`, `@/extensions/types`, `@/platform/scopedStorage`, `@/data/media`, `@/extensions/story`) and nothing else from the clone.

## R2. Branches, worktrees and PRs

- One worktree per agent. Branch names start with your prefix: `cg/backend/m1-plans`.
- Small PRs, one milestone slice each. Title prefix `[ios]`, `[backend]`, `[sim]`, `[shell]` or `[contracts]`.
- Rebase on `main` before opening. CI must be green. Never force-push `main`, never merge someone else's PR.
- A PR description lists: what changed, contract operations touched (by `operationId`), checks run, and anything another agent may want to know (copied into your STATUS.md too).

## R3. Talk only through contracts

- Never call another agent's private code, read its database, or depend on its file layout. Use the API, the files in `data/` described in CONTRACTS §9, or `cg_matching`.
- Never reproduce another agent's logic. The app does not re-rank people or re-check privacy; the backend does not render UI copy beyond what the contract carries; the sim uses `cg_matching` for the Common Ground policy instead of re-implementing it.
- Never bypass the contract for convenience (an extra query parameter the spec lacks, a debug route the app calls, a sim script that writes into the backend database). If you need it, see R9.

## R4. Build against the contract, not the other agent

Every agent must be able to run, test and demo its part alone, from the first day.

| Agent | Stand-alone mode |
| --- | --- |
| ios | `make mock-api` (Prism serves `openapi.yaml` examples) plus an in-app fixture mode for flows Prism cannot stage (a group forming, Muse steps ticking, an approval, a reschedule). Works with the WebSocket disconnected. |
| backend | `MUSE_FAKE=1` and `LAYA_FAKE=1` give deterministic offline answers; with `MUSE_FAKE=1` the scripted planner runs the agent steps. A tiny built-in seed (a handful of personas, venues and plans) works when `data/seed/` is empty. |
| sim | `--fake-laya`, `--fake-muse`, and `--use-ground-truth` (stand-in for `/internal/v1/pools/{id}/export` until the backend serves it). |
| shell | Extension points tested with fixtures, like the existing `tests/features.test.ts`. No backend needed. |

When the real producer ships, you switch by configuration, not by code changes.

## R5. Be a tolerant reader and a conservative producer

Follow CONTRACTS §3 on everything you consume. On everything you produce: never remove, rename or retype a field; fill every required field; keep examples in `openapi.yaml` true (the backend's contract tests check them). Read every tunable number from `params.yaml` (services) or `/v1/config` (app). Hardcoded copies of those numbers are bugs.

## R6. Your leeway

You decide anything not fixed here or in the contracts. Make the best choice for your task and record it in STATUS.md.

| Agent | Decide freely | Fixed |
| --- | --- | --- |
| ios | Component structure, state management, animation, gesture use (already installed: reanimated, gesture-handler), carousel and pop-up implementation, step timeline design, calendar reconciliation internals, copy within R12 for client-only strings, empty and loading states, file layout inside your folder | Routes under `/common-ground`, extension-point registration, tokens and `useColors()`, API shapes, client duties C1 to C8, Expo Go only, the dependency allowlist |
| backend | Framework internals (FastAPI is suggested), database and ORM, job runner, caching, Muse prompts and tool schemas, the scripted planner, step copy templates, simulated provider internals, Laya batching, realtime internals, synthetic-actor timing within `params.demo` | Every request and response shape, privacy guarantees P1 to P11, the autonomy bounds (CONTRACTS §5), ports, env var names, `cg_matching` signatures, Laya questions and templates, data file formats you read |
| sim | Persona, connector-record and venue generation methods, Muse prompts for seeding, avatar and venue photo style, Monte Carlo engine design, extra metrics, dashboard tech and layout, run output format | Seed file schemas, `demo.json` rules, Laya table format, `questionsVersion`, using `cg_matching` for plan proposals and the Common Ground policy, claims rule (relative results only), dashboard binds to loopback |
| shell | How extension points are implemented, tab bar layout for six tabs, Messenger and Events row placement, test refactors | The TypeScript interfaces in CONTRACTS §11, existing clone behavior and checks, the dependency allowlist and permission strings |

## R7. Privacy and safety

The backend enforces P1 to P11 (CONTRACTS §8) and tests each one. The app adds these client duties:

- **C1** Never write another user's data to disk. In-memory caches only; scoped storage holds only the user's own preferences, drafts, the demo identity override and the mapping from calendar directive keys to device event IDs. Calendar events the app writes carry only the directive's title, times, location and notes, which never name another person.
- **C2** Location: one reading when the user taps Check in, nothing else. When `config.demo.fakeLocation` is set, send that instead and do not request location permission. No location layer on venue maps.
- **C3** Never reference the internal API host, port or any `/internal/` path. No dashboard links, no debug menus that reach it.
- **C4** No analytics, crash reporting or third-party SDKs. Network peers: `EXPO_PUBLIC_CG_API_URL`, Apple Maps tiles for venue previews, and Apple Maps or Google Maps only when the user taps Directions (opened with `Linking`, carrying only the server's `Directions` URL).
- **C5** Never show another person's withdrawal, decline or "seen" state, or a reason a join was not filled, even if a field appears to allow it. Never show who is in a plan before the group forms.
- **C6** Show interests, signals and step labels exactly as the server sends them. Never combine responses to show more (for example, pairing a coarse crowd label with a later full-depth label in one place).
- **C7** Calendar: read only the start and end of events in the next `limits.calendarHorizonDays`, from the calendars the user allowed, excluding the app's own Common Ground calendar. Never read or send titles, notes, locations or attendees. Sync at most once per `limits.calendarSyncMinIntervalS` while foreground (plus right after applying directives). Write only to the "Common Ground" calendar the app created, and only what directives say.
- **C8** Approvals: never approve on the user's behalf, never pre-check an approval, and always show the amount and payee on the approval sheet before the approve button is enabled.

Everyone: no real people's names or photos in seed data or UI fixtures, and no secrets in commits.

## R8. Demo invariants

- **D1** The app runs in Expo Go (SDK 57) on an iPhone. No development build, no Xcode, no native modules outside Expo Go.
- **D2** With `DEMO_MODE=1`, the demo is fully reproducible: same seed, same first feed for Maya (`demo.json` `featuredPlanIds`), same hero and nudge plans, same tables. `POST /internal/v1/demo/reset` returns to that state in under 10 seconds.
- **D3** The counterpart toggle (live second phone or synthetic) can flip at any moment without breaking an open thread, a forming plan or a meetup being set up.
- **D4** Every Muse or Laya call has a fallback that keeps the demo moving: the scripted planner and templated copy for Muse (the Muse bar falls back to keyword filtering), the fake probability for Laya, with a log line saying so. A failed booking always produces a visible fallback step, never a stuck timeline.
- **D5** The existing clone keeps passing its own checks (`npm test`, `npm run test:native`, `typecheck`, `lint`, `test:e2e`, both builds). On web, Common Ground runs on the in-app mock only and makes no network requests; calendar and notifications are no-ops.
- **D6** No real money, bookings or third-party accounts. Payments, bookings and every connector except the device calendar are simulated.
- **D7** The visible agent reads on stage: Muse steps advance with `params.demo.stepDelayS` between them, and every step transition reaches the phone within 2 seconds (realtime, or polling at `limits.pollIntervalS`).

## R9. When you need something from another agent

1. Do not edit their files. Do not wait.
2. If the contract already covers it, build against the contract with a mock and move on.
3. If the contract lacks it, open a `cg/contracts/` PR proposing the additive change (spec, example, changelog line). Build your side behind a feature check so it stays hidden until the producer ships (CONTRACTS §3 rule 6).
4. Add a `needs:` line to your STATUS.md naming the agent and the `operationId` or file.
5. Producers check other agents' STATUS.md `needs:` lines at the start of each milestone.

## R10. STATUS.md

Each agent keeps one file in its own space: `facebook-clone/src/features/common-ground/STATUS.md`, `services/api/STATUS.md`, `services/sim/STATUS.md`, `facebook-clone/docs/COMMON_GROUND_SHELL_STATUS.md` (shell). Update it in every PR. It is how agents learn about each other without talking.

```markdown
# <agent> status
Milestone: M1 (in progress)
## Done
- 2026-11-13 getFeed, getPlan, joinPlan live (contract v2.0.0)
## Decisions
- 2026-11-13 Plan pop-up is a formSheet modal route. Why: native swipe-to-dismiss.
## Needs
- needs: backend meetup.step realtime (polling the meetup meanwhile)
## Known gaps
- Muse permissions UI hidden until features.autonomySettings is true
```

## R11. Definition of done (every PR)

- Only your paths changed (`python scripts/check_ownership.py`).
- Your checks pass: ios and shell run the clone's checks (`npm test`, `npm run test:native`, `npm run typecheck`, `npm run lint`; `npm run test:e2e` when web code changed); backend runs `pytest`, contract tests and privacy tests; sim runs `pytest` and `cg-sim seed --check`.
- Contract conformance: the backend validates real responses against `openapi.yaml`; ios parses every `openapi.yaml` example through its API types in a test.
- No secrets, no `.env`, no real-person data. Formatting run (`npm run format`, `ruff format`).
- STATUS.md updated.

## R12. Product voice and names

| Use | Avoid |
| --- | --- |
| Common Ground (the feature), Muse (the AI) | Ditto, the algorithm, the bot |
| people, someone, new friends, people you've met | matches, swipes, candidates, users |
| plan, I'm in, Can't make it | RSVP, apply, join request, Like |
| For you, Your plans | feed, drop, queue (internal words only) |
| Muse is gathering people, Muse is setting it up, Muse booked it | the system, processing, pending |
| OK $35?, Muse will ask before paying | charge, authorize, transaction |
| This one didn't fill | rejected, not selected, unmatched |
| shared interests, you both like, 2 also do ceramics | compatibility score, percentages |
| Plans (tab label), What do you want to do? (Muse bar) | Map, Friend finder, Discover |
| Muse noticed, Because you've been to … | tracking, we detected, your data shows |

Copy is warm, short and plain. No percentages or scores shown to users. No emoji in UI chrome. Muse speaks in first person, briefly, and never pretends to be a person. Muse says what it did ("I booked 3 wheels"), not what the system did. Nudges are about the activity, never about loneliness.

## R13. Milestones

Each agent moves through these on its own schedule; the mocks in R4 remove waiting. The two integration checkpoints are the only times agents depend on each other's real output.

| Milestone | shell | backend | sim | ios |
| --- | --- | --- | --- | --- |
v1 M0 to M1 work exists for shell (extension points, done) and ios (map-era screens on the in-app mock). The v2 table below restarts the milestones; shell's v2 M0 is only the dependency update in PRD-4 step 10.

| Milestone | shell | backend | sim | ios |
| --- | --- | --- | --- | --- |
| **M0 Skeletons** (first PR) | `expo-calendar`, `expo-notifications`, permission strings (PRD-4 step 10) | Every public and internal route returns its `openapi.yaml` example; `/v1/config` from params; `cg_matching` v2 signatures with naive bodies | Seed v0 for both pools: personas, activity, connector records, venues, plans, `demo.json`, Maya from the clone seed; schema-valid and deterministic | v2 API client and types, contract test on v2 examples, mock mode, Plans tab renders the mock feed; map-era screens removed |
| **M1 Core loop** | | Seed load, extraction and signals, setup, connectors, feed via `rank_plans`, Muse bar, joins, `form_groups`, meetups with the scripted planner, threads, intro and starters | Extraction and sensitive-gate eval, Laya precompute, tables written | Setup and connectors, Muse bar, carousel, plan pop-up, I'm in, Your plans, meetup timeline (polling), chat |
| **Checkpoint A** | | | | ios points at the live backend; backend loads sim seed and tables |
| **M2 Agent and integrations** | Six-tab polish and checks | Muse agent with tools, approvals and simulated payments, simulated booking with failures, calendar directives, travel and leave-by, Muse in chat (`toMuse`, reschedule, backfill), nudges, check-in, realtime, synthetic counterparts, internal graph and metrics | Monte Carlo, three policies, sweeps, report; dashboard replay, live graph with groups, demo controls | Approvals, calendar sync and writes, local leave-by notifications, directions, nudges on Home and Events, check-in, feedback, realtime |
| **Checkpoint B** | | | | Full demo script end to end on two phones and the laptop |
| **M3 Demo hardening** | | Reset under 10 s, fallbacks, load | Final run for slides | Second-phone identity, polish, should-haves |
