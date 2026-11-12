# Common Ground: build handoff

Four agents build Common Ground in parallel, each in its own git worktree, merging through PRs. They never need to talk: the contracts fix every interface, the rules fix what each may change, and each PRD says what to build and where they may choose freely.

| Read | What it is |
| --- | --- |
| [contracts/CONTRACTS.md](../../contracts/CONTRACTS.md) | Every shared interface: API, data files, Python and TypeScript seams, privacy guarantees, env, commands |
| [AGENT_RULES.md](AGENT_RULES.md) | Ownership, how to change a contract, leeway, privacy and demo invariants, definition of done, milestones |
| [PRD-1 iOS](PRD-1-ios-common-ground.md) | Map tab, finder overlay, chat and meetups inside the Expo app |
| [PRD-2 Backend and AI](PRD-2-backend-ai.md) | Public and internal APIs, Muse, Laya, `cg_matching`, synthetic counterparts |
| [PRD-3 Simulation and dashboard](PRD-3-simulation-dashboard.md) | Seed data, Laya precompute, Monte Carlo, backend-only dashboard |
| [PRD-4 Facebook shell](PRD-4-facebook-shell.md) | The small clone changes that let Common Ground plug in |
| [DESIGN.md](DESIGN.md) | Product design and rationale |

## Start the agents

From the repo root, one worktree per agent:

```sh
git worktree add ../cg-shell   -b cg/shell/m0
git worktree add ../cg-backend -b cg/backend/m0
git worktree add ../cg-sim     -b cg/sim/m0
git worktree add ../cg-ios     -b cg/ios/m0
```

Open Claude Code in each and paste its kickoff prompt. Start shell first: its M0 is small and the ios agent's first PR merges after it.

**shell**
> You are the shell agent for Common Ground. Read `docs/common-ground/AGENT_RULES.md`, `contracts/CONTRACTS.md` §11, and `docs/common-ground/PRD-4-facebook-shell.md`, then follow PRD-4. Write only in your paths, keep every existing clone check passing, and open a PR titled `[shell] M0 extension points` when steps 1 to 8 are done.

**backend**
> You are the backend agent for Common Ground. Read `docs/common-ground/AGENT_RULES.md`, `contracts/CONTRACTS.md`, both OpenAPI files, and `docs/common-ground/PRD-2-backend-ai.md`. Start with M0: every route returning its contract example, `/v1/config` from `params.yaml`, and `cg_matching` with the frozen signatures. Open `[backend] M0 skeleton` as soon as it passes, then continue through the milestones in AGENT_RULES R13. Keep `services/api/STATUS.md` current.

**sim**
> You are the sim agent for Common Ground. Read `docs/common-ground/AGENT_RULES.md`, `contracts/CONTRACTS.md`, `contracts/schemas/`, `contracts/laya_questions.yaml`, and `docs/common-ground/PRD-3-simulation-dashboard.md`. Start with M0: deterministic, schema-valid seed v0 for both pools, with Maya and `demo.json`. Open `[sim] M0 seed` as soon as `cg-sim seed --check` passes, then continue through the milestones. Keep `services/sim/STATUS.md` current.

**ios**
> You are the ios agent for Common Ground. Read `docs/common-ground/AGENT_RULES.md`, `contracts/CONTRACTS.md`, `contracts/openapi.yaml`, `facebook-clone/docs/ARCHITECTURE.md`, `facebook-clone/docs/EXTENDING.md`, and `docs/common-ground/PRD-1-ios-common-ground.md`. Build against `make mock-api` until Checkpoint A. Your first PR registers the feature and the Map tab and merges after the shell agent's M0. Keep `facebook-clone/src/features/common-ground/STATUS.md` current.

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
- Resolved: Maya's pitch is "Maya wants friends who are into what she's into," not "just moved to SF." Her clone seed stays unchanged (PRD-4, last section).
