# Common Ground: build handoff

Four agents build Common Ground in parallel, each in its own git worktree, merging through PRs. They never need to talk: the contracts fix every interface, the rules fix what each may change, and each PRD says what to build and where they may choose freely.

**Contracts v2 (2026-11-12).** After judge feedback, Common Ground is plans-first: a Muse bar ("What do you want to do?"), a carousel of suggested plans, I'm in, and Muse as a visible agent that books, pays with permission, calendars and coordinates. Connectors (Google Maps, calendar, Strava…) feed proactive nudges. The map tab, friend location and the people drop are gone. [DESIGN § What changed from v2](DESIGN.md#what-changed-from-v2) has the why; [CONTRACTS changelog](../../contracts/CONTRACTS.md#changelog) has the what.

| Read | What it is |
| --- | --- |
| [contracts/CONTRACTS.md](../../contracts/CONTRACTS.md) | Every shared interface: API, data files, Python and TypeScript seams, privacy guarantees, env, commands |
| [AGENT_RULES.md](AGENT_RULES.md) | Ownership, how to change a contract, leeway, privacy and demo invariants, definition of done, milestones |
| [PRD-1 iOS](PRD-1-ios-common-ground.md) | Plans tab (Muse bar, plan carousel, Your plans), plan pop-up, setup and connectors, meetup timeline and approvals, chat, calendar sync and reminders inside the Expo app |
| [PRD-2 Backend and AI](PRD-2-backend-ai.md) | Public and internal APIs, the Muse bar and agent, Laya, `cg_matching`, simulated connectors, booking and payments, synthetic counterparts |
| [PRD-3 Simulation and dashboard](PRD-3-simulation-dashboard.md) | Seed data (personas, activity, connector records, venues, plans), Laya precompute, Monte Carlo, backend-only dashboard |
| [PRD-4 Facebook shell](PRD-4-facebook-shell.md) | The small clone changes that let Common Ground plug in (v2: two dependencies and permission strings) |
| [DESIGN.md](DESIGN.md) | Product design and rationale (v3) |
| [FRONTEND_PLAN.md](FRONTEND_PLAN.md) | Historical: the v1 mock-first frontend build plan. Its §0 design language still applies |

## Start the agents

From the repo root, one worktree per agent:

```sh
git worktree add ../cg-shell   -b cg/shell/v2-m0
git worktree add ../cg-backend -b cg/backend/v2-m0
git worktree add ../cg-sim     -b cg/sim/v2-m0
git worktree add ../cg-ios     -b cg/ios/v2-m0
```

Open Claude Code in each and paste its kickoff prompt. Start shell and ios first: shell's v2 M0 is two dependencies, and the ios agent's first v2 PR turns CI's app job green again after the contracts v2 merge.

**shell**
> You are the shell agent for Common Ground. Read `docs/common-ground/AGENT_RULES.md`, `contracts/CONTRACTS.md` §11, and `docs/common-ground/PRD-4-facebook-shell.md`. Steps 1 to 9 are already done; do step 10 (contracts v2). Write only in your paths, keep every existing clone check passing, update your status file, and open a PR titled `[shell] v2 M0 calendar and notifications`.

**backend**
> You are the backend agent for Common Ground. Read `docs/common-ground/AGENT_RULES.md`, `contracts/CONTRACTS.md` (v2), both OpenAPI files, `contracts/connectors.yaml`, and `docs/common-ground/PRD-2-backend-ai.md`. Start with M0: every route returning its contract example, `/v1/config` from `params.yaml`, and `cg_matching` with the frozen v2 signatures. Open `[backend] v2 M0 skeleton` as soon as it passes, then continue through the milestones in AGENT_RULES R13. Keep `services/api/STATUS.md` current.

**sim**
> You are the sim agent for Common Ground. Read `docs/common-ground/AGENT_RULES.md`, `contracts/CONTRACTS.md` (v2), `contracts/schemas/`, `contracts/connectors.yaml`, `contracts/laya_questions.yaml`, and `docs/common-ground/PRD-3-simulation-dashboard.md`. Start with M0: deterministic, schema-valid seed v0 for both pools (personas, activity, connector records, venues, plans), with Maya and `demo.json`. Open `[sim] v2 M0 seed` as soon as `cg-sim seed --check` passes, then continue through the milestones. Keep `services/sim/STATUS.md` current.

**ios**
> You are the ios agent for Common Ground. Read `docs/common-ground/AGENT_RULES.md`, `contracts/CONTRACTS.md` (v2), `contracts/openapi.yaml`, `facebook-clone/docs/ARCHITECTURE.md`, `facebook-clone/docs/EXTENDING.md`, and `docs/common-ground/PRD-1-ios-common-ground.md`. Your first v2 PR follows PRD-1 §3: remove the map-era screens, move types, mock and the contract test to v2, and render the Plans tab from the mock feed. Build against the in-app mock and `make mock-api` until Checkpoint A. Keep `facebook-clone/src/features/common-ground/STATUS.md` current.

## Run the demo stack

```sh
cp .env.example .env                    # fill MODEL_API_KEY, LAYA_URL, EXPO_PUBLIC_CG_API_URL
make api                                # backend: public :8000, internal :9001
make seed POOL=pool_sf_city             # backend loads data/seed/pool_sf_city
make dashboard                          # laptop dashboard on 127.0.0.1:9100
make app                                # Expo dev server; open in Expo Go on the iPhone
```

Without a backend, `make mock-api` serves the contract examples on :8000.

## Integrator checklist (human)

- Review and merge `cg/contracts/` PRs; nobody else edits `contracts/`.
- Watch each agent's STATUS.md `needs:` lines at each milestone.
- At Checkpoint A, point the app at the live backend; at Checkpoint B, rehearse the demo script with two phones and the laptop.
- Before the demo: on the stage iPhone, grant calendar and notification permissions once, and leave Saturday morning free in its calendar (or keep it empty so Maya's seeded Google Calendar busy blocks decide).
- Contracts v2 merge turns CI's app job red until the ios agent's first v2 PR rewrites `tests/common-ground/contract.test.ts` (PRD-1 §3). Merge that PR next.
- Resolved: Maya's pitch is "Maya wants friends who are into what she's into," not "just moved to SF." Her clone seed stays unchanged (PRD-4, last section).
