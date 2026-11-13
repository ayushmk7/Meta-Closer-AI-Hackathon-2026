# Meta Closer Together AI Hackathon 2026

**Unofficial hackathon demo; not affiliated with or endorsed by Meta or Facebook.**

> **Demo day: start at [`docs/common-ground/system/status.md`](docs/common-ground/system/status.md).** Code is frozen for the demo. That page has what is merged, what runs where, the demo-day checklist, what is real vs synthetic, and the known gaps. Commands: [`runbook.md`](docs/common-ground/system/runbook.md).

**Meetups** is a plans-first Facebook feature for people who want friends: tell Muse what you want to do, tap I'm in, and Muse forms the group and handles the logistics (time, booking, payment with your OK, calendar, chat, directions) while you just show up. Connected apps like Google Maps and your calendar let Muse suggest meetups at the moments you'd want company. "Common Ground" is the feature's internal and code name.

Muse is Meta's LLM API (`muse-spark-1.3`); Laya is a local probability model served by `laya-serve`. In the demo, Muse, Laya and Google Calendar free/busy are real; the other people, bookings, payments, the restaurant call and templated chat replies are synthetic ([details](docs/common-ground/system/status.md#real-vs-synthetic)).

| Folder | What |
| --- | --- |
| `facebook-clone/` | The Facebook clone (Expo: web and native iOS) with the Meetups feature. See its own README. |
| `contracts/` | Shared interfaces for Meetups. Start at `contracts/CONTRACTS.md`. |
| `docs/common-ground/` | Design, agent rules and the four PRDs. Start at `docs/common-ground/README.md`. |
| `docs/common-ground/system/` | How the running system works: status, backend, ML, Muse, Laya, sim, app, e2e, UX audit, perf and bugs, runbook. Start at [`docs/common-ground/system/README.md`](docs/common-ground/system/README.md). |
| `services/api/` | Backend and AI (PRD-2) |
| `packages/matching/` | `cg_matching`, shared by the backend and the simulation (PRD-2) |
| `services/sim/`, `services/dashboard/` | Seed data, Laya simulation, backend-only dashboard (PRD-3) |
| `data/` | Seed, Laya tables and simulation runs (PRD-3) |
| `scripts/e2e_flow.py` | Walks the whole demo flow through the API |
| `HUMAN_TODO.md`, `CHECKPOINT_B.md` | Steps only a person can do; device test script |
