# Agent rules

Four agents build Common Ground in parallel, each in its own worktree, merging through PRs. These rules let each one make its own best choices without breaking the others or needing updates from them. Follow them exactly; inside them, decide freely.

Read first: [contracts/CONTRACTS.md](../../contracts/CONTRACTS.md), then this file, then your PRD. [DESIGN.md](DESIGN.md) explains the why. Precedence when they disagree: contracts > these rules > your PRD > DESIGN.

| Agent | PRD | Builds |
| --- | --- | --- |
| **ios** | [PRD-1](PRD-1-ios-common-ground.md) | The Common Ground feature inside the Expo app: map tab, finder overlay, chat, meetups |
| **backend** | [PRD-2](PRD-2-backend-ai.md) | Public and internal APIs, Muse, Laya, matching package, synthetic counterparts |
| **sim** | [PRD-3](PRD-3-simulation-dashboard.md) | Seed data, Laya precompute, Monte Carlo simulation, backend-only dashboard |
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
- Allowed cross-boundary imports, read-only: sim and dashboard import `cg_matching` (path dependency on `packages/matching`). ios imports the clone's public exports (`@/core/store` `useDemo`, `@/ui/native`, `@/ui/tokens`, `@/extensions/types`, `@/platform/scopedStorage`, `@/data/media`) and nothing else from the clone.

## R2. Branches, worktrees and PRs

- One worktree per agent. Branch names start with your prefix: `cg/backend/m1-drops`.
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
| ios | `make mock-api` (Prism serves `openapi.yaml` examples) plus an in-app fixture mode for flows Prism cannot stage. Works with the WebSocket disconnected. |
| backend | `MUSE_FAKE=1` and `LAYA_FAKE=1` give deterministic offline answers. A tiny built-in seed works when `data/seed/` is empty. |
| sim | `--fake-laya`, `--fake-muse`, and `--use-ground-truth` (stand-in for `/internal/v1/pools/{id}/export` until the backend serves it). |
| shell | Extension points tested with fixtures, like the existing `tests/features.test.ts`. No backend needed. |

When the real producer ships, you switch by configuration, not by code changes.

## R5. Be a tolerant reader and a conservative producer

Follow CONTRACTS §3 on everything you consume. On everything you produce: never remove, rename or retype a field; fill every required field; keep examples in `openapi.yaml` true (the backend's contract tests check them). Read every tunable number from `params.yaml` (services) or `/v1/config` (app). Hardcoded copies of those numbers are bugs.

## R6. Your leeway

You decide anything not fixed here or in the contracts. Make the best choice for your task and record it in STATUS.md.

| Agent | Decide freely | Fixed |
| --- | --- | --- |
| ios | Component structure, state management (React context, reducers, hooks), animation, gesture library use (already installed: reanimated, gesture-handler), bottom-sheet implementation, map marker design, copy within R12, empty and loading states, file layout inside your folder | Routes under `/common-ground`, extension-point registration, tokens and `useColors()`, API shapes, privacy duties C1 to C6, Expo Go only, no new dependencies |
| backend | Framework internals (FastAPI is suggested), database and ORM, migrations, job runner, caching, Muse prompts, Laya batching, realtime transport internals, synthetic-actor timing within `params.demo` | Every request and response shape, privacy guarantees P1 to P10, ports, env var names, `cg_matching` signatures, Laya questions and templates, data file formats you read |
| sim | Persona generation method, Muse prompts for seeding, avatar style, Monte Carlo engine design, extra metrics, dashboard tech and layout, run output format | Seed file schemas, `demo.json` rules, Laya table format, `questionsVersion`, using `cg_matching` for the Common Ground policy, claims rule (relative results only), dashboard binds to loopback |
| shell | How extension points are implemented, tab bar layout for six tabs, Messenger and Events row placement, test refactors | The TypeScript interfaces in CONTRACTS §11, existing clone behavior and checks, the dependency allowlist |

## R7. Privacy and safety

The backend enforces P1 to P10 (CONTRACTS §8) and tests each one. The app adds these client duties:

- **C1** Never write another user's data to disk. In-memory caches only; the scoped storage key holds only the user's own preferences, drafts and the demo identity override.
- **C2** Send location only while the map tab is foreground, at most once per `limits.locationMinIntervalS`. When `config.demo.fakeLocation` is set, send that instead of GPS and do not request location permission.
- **C3** Never reference the internal API host, port or any `/internal/` path. No dashboard links, no debug menus that reach it.
- **C4** No analytics, crash reporting or third-party SDKs. The only network peers are `EXPO_PUBLIC_CG_API_URL` and Apple Maps tiles.
- **C5** Never show another person's pass, dismissal, decline or "seen" state, even if a field appears to allow it.
- **C6** Show interests exactly as the server sends them. Never combine responses to show more (for example, joining a coarse card label with a later full-depth label in one place).

Everyone: no real people's names or photos in seed data or UI fixtures, and no secrets in commits.

## R8. Demo invariants

- **D1** The app runs in Expo Go (SDK 57) on an iPhone. No development build, no Xcode, no native modules outside Expo Go.
- **D2** With `DEMO_MODE=1`, the demo is fully reproducible: same seed, same first drop for Maya (featured people from `demo.json`), same tables. `POST /internal/v1/demo/reset` returns to that state in under 10 seconds.
- **D3** The counterpart toggle (live second phone or synthetic) can flip at any moment without breaking an open thread or meetup.
- **D4** Every Muse or Laya call has a fallback that keeps the demo moving: templated text for Muse, the fake probability for Laya, with a log line saying so.
- **D5** The existing clone keeps passing its own checks (`npm test`, `npm run test:native`, `typecheck`, `lint`, `test:e2e`, both builds). On web, Common Ground makes no network requests.

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
- 2026-11-12 getCurrentDrop, decideSuggestion live (contract v1.0.0)
## Decisions
- 2026-11-12 Bottom sheet built on reanimated, three snap points. Why: matches Find My.
## Needs
- needs: backend getDensity (blocked density layer; showing count only meanwhile)
## Known gaps
- Group invites UI hidden until features.groups is true
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
| people, someone, new friends | matches, swipes, candidates, users |
| Connect, Pass, Say hi | Like, Reject, Swipe |
| Today's people | drop (internal word only) |
| meetup, plan, Muse found 3 options | date, hangout request |
| shared interests, you both like | compatibility score, percentages |
| Map (tab label), Find people (button) | Friend finder, Discover |

Copy is warm, short and plain. No percentages or scores shown to users. No emoji in UI chrome. Muse speaks in first person, briefly, and never pretends to be a person.

## R13. Milestones

Each agent moves through these on its own schedule; the mocks in R4 remove waiting. The two integration checkpoints are the only times agents depend on each other's real output.

| Milestone | shell | backend | sim | ios |
| --- | --- | --- | --- | --- |
| **M0 Skeletons** (first PR) | Extension points, scoped storage, allowlisted deps, Map tab placeholder | Every public and internal route returns its `openapi.yaml` example; `/v1/config` from params; `cg_matching` with frozen signatures and a naive body | Seed v0 for both pools: schema-valid, deterministic, `demo.json`, Maya from the clone seed | API client and types, mock mode, Map tab renders mock map and tray |
| **M1 Core loop** | Messenger and Events rows, reset hook, web placeholder | Seed load and extraction, onboarding, drops via `cg_matching`, connect, opener, threads, Muse intro and starters | Extraction eval vs ground truth, Laya precompute, tables written | Onboarding, finder overlay, drop cards, connect and pass, say hi, chat |
| **Checkpoint A** | | | | ios points at the live backend; backend loads sim seed and tables |
| **M2 Meetups and map** | Six-tab polish and checks | Muse meetup agent, votes, Events, location, density, realtime, synthetic counterparts, internal graph | Monte Carlo, three policies, sweeps, report; dashboard replay, live graph, demo controls | Meetups, votes, check-in, feedback, map pins and precision, density layer, realtime |
| **Checkpoint B** | | | | Full demo script end to end on two phones and the laptop |
| **M3 Demo hardening** | | Reset under 10 s, fallbacks, load | Final run for slides | Second-phone identity, polish, should-haves |
