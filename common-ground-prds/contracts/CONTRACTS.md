# Common Ground contracts (v1)

This folder is the only thing the four agents share. If two agents follow these files, their work fits together without them talking to each other. Owned by the human integrator; changes follow [Change process](#13-change-process).

Precedence when documents disagree: **contracts/** > [AGENT_RULES](../docs/common-ground/AGENT_RULES.md) > your PRD > [DESIGN](../docs/common-ground/DESIGN.md). For anything inside the existing Facebook clone, the clone's own `facebook-clone/docs/ARCHITECTURE.md` and `EXTENDING.md` also apply.

## 1. Files

| File | What it fixes | Producer | Consumers |
| --- | --- | --- | --- |
| `openapi.yaml` | Public API: app ↔ backend | backend | iOS |
| `openapi.internal.yaml` | Internal API: sim, dashboard, demo controls ↔ backend | backend | sim, dashboard |
| `params.yaml` | Every tunable number | human (sim proposes changes) | backend, sim; app via `/v1/config` |
| `modes.yaml` | Modes and pools | human | backend, sim |
| `taxonomy.yaml` | Interest IDs, labels, sensitive flags | human | backend, sim |
| `laya_questions.yaml` | Every Laya question, state template and table format | human | backend, sim |
| `laya_golden.json` | Reference renders of Laya states; both renderers must match byte for byte | human | backend, sim |
| `openapi.json` | Generated JSON copy of `openapi.yaml` (`python scripts/build_openapi_json.py`); CI checks it is in sync | human | ios tests, mocks |
| `schemas/*.schema.json` | Seed files, demo identities, pool export | sim / backend | backend / sim |
| This file | Conventions, state machines, realtime, privacy guarantees, data layout, Python and TypeScript interfaces, env, commands | human | everyone |

## 2. Conventions

- **JSON:** camelCase keys. Timestamps ISO 8601 UTC with `Z`. Coordinates `{ "lat": 37.77, "lng": -122.42 }`.
- **IDs:** opaque strings with a type prefix. Never parse them, never build them on the client.

  | Prefix | Thing | Prefix | Thing |
  | --- | --- | --- | --- |
  | `u_` | user (`u_maya`, `u_0042`) | `th_` | thread |
  | `pool_` | pool | `ms_` | message |
  | `ob_` | onboarding session | `mt_` | meetup |
  | `dr_` | drop | `op_` | meetup option |
  | `sg_` | suggestion | `vn_` | venue |
  | `hi_` | opener | `gr_` | group request |
  | `iv_` | invite | `rp_` | report |
  | `cn_` | connection | `sc_` | scene |
  | `om_` | onboarding message | `hx_` | density bin |

  Interest IDs are taxonomy paths (`outdoors.climbing.bouldering`), not prefixed.
- **Demo identity:** every public request carries `X-CG-User: <userId>`. v1 has no real authentication, so the backend refuses to start unless `DEMO_MODE=1`.
- **Maya:** the Facebook clone's viewer `maya` is Common Ground user `u_maya`. The app maps one to the other; the backend only knows `u_maya`.
- **Numbers:** clients never hardcode limits, sizes or intervals. They read `GET /v1/config` (`limits`, `features`, `modes`, `demo`), which the backend builds from `params.yaml` and `modes.yaml`:

  | `config` field | Source |
  | --- | --- |
  | `limits.dropMax` | `drops.size` |
  | `limits.sharedCoarseMax`, `limits.sharedFullMax` | `privacy.sharedCoarseMax`, `privacy.sharedFullMax` |
  | `limits.openersPerPersonPerWeek`, `limits.openerMaxChars` | `openers.perPersonPerWeek`, `openers.maxChars` |
  | `limits.messageMaxChars` | `messages.maxChars` |
  | `limits.groupSizeMin`, `limits.groupSizeMax` | `groups.sizeMin`, `groups.sizeMax` (the user's own cap is `Me.capabilities.maxGroupSize`) |
  | `limits.locationMinIntervalS` | `location.minIntervalS` |
  | `limits.meetupStatusBeforeMin` | `location.meetupWindowBeforeMin` |
  | `limits.pollIntervalS`, `limits.mapRefreshS` | `client.pollIntervalS`, `client.mapRefreshS` |
  | `features.*` | `features.*` |
  | `modes[]` | `modes.yaml` pools; specced modes appear with `available: false` |
  | `demo.*` | internal demo state, defaults from `params.demo` and `demo.json` |
- **Text the user sees** from the server (`reason`, `message`, Muse messages) is final copy. Clients display it as is.

## 3. Tolerant reader rules (every consumer)

These rules are what let each agent change its internals without breaking the others.

1. Ignore unknown JSON fields.
2. Treat an absent optional field and `null` the same.
3. Unknown enum value: render a neutral fallback (hide the badge, show generic text), never crash. Enums marked "Open enum" in the spec will grow.
4. Unknown `MessageAttachment.kind` or realtime `type`: skip it.
5. Unknown error `code`: fall back on the HTTP status.
6. A `features.*` flag that is false or missing hides that surface completely.
7. Realtime events are hints. REST is the source of truth. After an event, refetch the resource it names.
8. Everything must work with realtime disconnected, by polling at `limits.pollIntervalS` (open thread, meetup in progress) and `limits.mapRefreshS` (map).
9. Long calls (onboarding turns, `plan`) can take 2 to 15 s. Show progress; time out at 30 s with a retry.

Producers, in return, never remove or rename a field, never change a field's type, never reuse an ID, and only add enum values to enums marked open.

## 4. Public API map

The full shapes and examples are in `openapi.yaml`. Every endpoint is required for v1 unless its feature flag is off.

| Area | Operations | Flag |
| --- | --- | --- |
| System | `getHealth`, `getConfig`, `realtime` (WebSocket) | `realtime` for WS |
| Me | `getMe`, `updateMe`, `setInterestVisibility`, `removeInterest`, `optIn`, `optOut` | |
| Onboarding | `startOnboarding`, `sendOnboardingMessage`, `completeOnboarding` | |
| Discovery | `getDensity`, `getCurrentDrop`, `decideSuggestion`, `sayHi`, `listHi`, `replyHi`, `dismissHi` | `density`, `sayHi` |
| Groups | `requestGroup`, `getGroupRequest`, `listInvites`, `decideInvite` | `groups` |
| Connections | `listConnections`, `getPerson` | |
| Chat | `listThreads`, `getThread`, `listMessages`, `sendMessage`, `markThreadRead` | |
| Meetups | `planMeetup`, `listMeetups`, `getMeetup`, `voteMeetup`, `setMeetupStatus`, `checkIn`, `sendFeedback` | `checkin` for the last three |
| Map | `getMap`, `updateLocation`, `setLocationShare`, `setLocationView`, `setGhostMode` | `locationSharing` |
| Community | `getSceneLeaderboard`, `followScene` | `leaderboard` |
| Safety | `report`, `block` | |

## 5. State machines

The backend owns every transition. Clients render the state they are given and never infer a transition locally (optimistic UI is allowed if it is reconciled with the next fetch).

**Suggestion (one per viewer per card).** `open` → `connect_sent` (I connected, they have not) → `connected` (both connected; a Connection and a thread exist). `open` → `passed` (only I see this). `open` or `connect_sent` → `expired` at `expiresAt`. An expired card looks the same whether the other person passed or never opened the app.

**Opener.** `sayHi` → `delivered` or `rejected` (`screened`, `limit`, `not_allowed`). The recipient sees a `HiItem` with a coarse PersonCard. `replyHi` creates a mutual Connection and a thread. `dismissHi` is silent.

**Group request.** `inviting` → `formed` (enough accepted and the compatibility check passed; group thread created) or `fallback_1to1` (one-to-one threads created instead) or `failed` (nobody accepted before expiry).

**Connection.** `new` → `met` after the first meetup that counts (see `params.checkin.meetupCountsWhen`).

**Meetup.** `proposing` (Muse is working) → `voting` (2 or 3 options) → `confirmed` (the first option every attendee voted yes on; a private Event exists, `eventLabel` set) → `completed` (end time passed; `feedbackDue` true until feedback is sent). Any state → `cancelled`.

**Location for one pair.** Each side sets `iShare` (`off` default, `neighborhood`, `exact`) for the other; each side sets `viewing` (`neighborhood` or `exact`). A pin appears only when both `iShare` are not `off`. Effective precision = the coarser of the sharer's `iShare` and the viewer's `viewing`. Ghost mode overrides everything to hidden. During a meetup window, attendees see `meetupStatus` even without sharing.

## 6. Realtime

`ws://<api-host>/v1/ws?user=<userId>`. Server → client frames are `RealtimeEvent` (`openapi.yaml` components): `{ "type", "eventId", "at", "data" }`. The client sends nothing but optional `{"type":"ping"}`; the server may send `{"type":"pong"}`. Reconnect with backoff (1, 2, 4, 8, max 15 s) and refetch everything visible after reconnecting.

| type | data | Client refetches |
| --- | --- | --- |
| `message.created` | Message | that thread's messages (or appends `data` if contiguous) |
| `thread.updated` | Thread | `/v1/threads` |
| `connection.created` | Connection | `/v1/connections`, `/v1/map` |
| `drop.updated` | `{ dropId }` | `/v1/drops/current` |
| `hi.received` | HiItem | `/v1/hi` |
| `invite.received` | Invite | `/v1/invites` |
| `group.updated` | GroupRequest | that group request |
| `meetup.updated` | Meetup | that meetup, `/v1/map` |
| `map.updated` | `{}` | `/v1/map` |
| `me.updated` | `{}` | `/v1/me`, `/v1/config` |

## 7. Errors

Envelope: `{ "error": { "code", "message", "retryable", "details"? } }`. `message` is safe to show.

| HTTP | code | When |
| --- | --- | --- |
| 400 | `validation_failed` | Bad body or parameters |
| 401 | `unauthenticated` | Missing or unknown `X-CG-User` |
| 403 | `not_allowed` | Not permitted (private profile, not a connection, trust gate) |
| 403 | `not_opted_in` | Drops, suggestions, openers, groups or invites before `optIn` (`getDensity` works before opt-in) |
| 404 | `not_found` | Unknown or no longer visible ID (including blocked people) |
| 409 | `conflict` | State changed (vote on a confirmed meetup) |
| 429 | `rate_limited` | Limits from params |
| 503 | `muse_unavailable`, `laya_unavailable`, `unavailable` | Dependency down; `retryable: true` |

## 8. Privacy guarantees (server-enforced, tested)

The backend guarantees these on every response. The app relies on them and does not re-implement them. The backend agent writes one automated test per line.

- **P1 Overlap only.** No public response ever contains another user's interest that is not shared with the viewer, or any of their hidden interests.
- **P2 Two-stage reveal.** Before a mutual connect, shared interests are level 2 (`level: 2`) and at most `privacy.sharedCoarseMax`. After, level 3 is allowed, at most `privacy.sharedFullMax`.
- **P3 Private profiles.** For a private user, `displayName` and `avatarUrl` are null before a mutual connect; after, `displayName` is first name only and `avatarUrl` stays null; `getPerson` returns 403.
- **P4 Sensitive interests.** An interest with `sensitive: true` is never in anyone else's response unless both users opted that category in.
- **P5 No enumeration.** No public endpoint lists users or accepts a free user search. People reach a client only through a drop, an opener, an invite, a connection or a meetup.
- **P6 Invisible passes.** No response tells a user that someone passed on them, dismissed their opener or declined their invite.
- **P7 Location.** Never more precise than the effective precision (section 5). `neighborhood` locations are neighborhood centroids, never real positions. Ghost mode hides the user everywhere.
- **P8 Density.** Bins with fewer than `privacy.densityMinBinCount` people are never returned. If the whole pool has fewer than that minimum, `totalLooking` is 0 and `bins` is empty.
- **P9 Internal surfaces.** Nothing from `openapi.internal.yaml` is served on the public listener. Blocked users are removed from every public response of the blocker.
- **P10 Data stays home.** User data goes only to the configured Muse endpoint and the configured Laya endpoint. No other third party.

## 9. Data layout

```
data/
  seed/<poolId>/                 written by sim, committed, read by backend
    pool.json                    schemas/pool.schema.json
    personas.jsonl               schemas/persona.schema.json, one object per line
    activity.jsonl               schemas/activity.schema.json
    onboarding.jsonl             schemas/onboarding_transcript.schema.json
    demo.json                    schemas/demo.schema.json (pools used in the demo only)
    avatars/<userId>.(png|jpg)   + avatars/PROVENANCE.md
  sim_private/<poolId>/          written by sim, committed, read ONLY by sim and dashboard
    ground_truth.jsonl, latent.jsonl   (format is the sim's choice)
  laya_tables/<poolId>/          written by sim, committed, read by backend
    connect.parquet, activity.parquet, meet_again.parquet, manifest.json   (laya_questions.yaml#tables)
  sim/runs/<runId>/              written by sim, read by dashboard (format is the sim's choice)
```

The backend must never open `data/sim_private/`. Seed and tables are deterministic for a given `rngSeed` and `questionsVersion`.

## 10. Python interface: `cg_matching`

`packages/matching` (owned by the backend agent) is the single implementation of vectors, candidates, scenes, the Common Ground ranker and group formation. The backend uses it live; the simulation imports it to run the same policy. These signatures are frozen for v1; internals are free.

```python
# packages/matching/src/cg_matching/__init__.py
from cg_matching.types import (
    PoolSnapshot,   # PoolSnapshot.from_export(dict) accepts schemas/pool_export.schema.json
    Params,         # Params.from_yaml(path) reads contracts/params.yaml
    LayaTables,     # LayaTables.from_dir(path) reads data/laya_tables/<poolId>/; .p_connect(a, b), .p_accept(u, t), .p_show(u, t), .p_meet_again(a, b)
    MatchState,     # exposures today, connection counts, blocked pairs, pending suggestions
    Suggestion,     # viewer_id, candidate_id, score, shared_coarse: list[str], scene_id
    GroupResult,    # member_ids, min_pairwise, status: "formed" | "fallback_1to1" | "failed"
)

def build_vectors(pool: PoolSnapshot, params: Params) -> "Vectors": ...
def candidates(pool: PoolSnapshot, vectors: "Vectors", params: Params) -> dict[str, list[tuple[str, float]]]: ...
def scenes(pool: PoolSnapshot, cands: dict[str, list[tuple[str, float]]], params: Params, seed: int) -> dict[str, str]: ...
def shared_interests(pool: PoolSnapshot, a: str, b: str, level: int, limit: int) -> list[str]: ...
def build_drops(pool: PoolSnapshot, cands: dict[str, list[tuple[str, float]]], tables: LayaTables,
                state: MatchState, params: Params, rng: "random.Random") -> dict[str, list[Suggestion]]: ...
def form_group(requester_id: str, invitee_ids: list[str], pool: PoolSnapshot, tables: LayaTables,
               params: Params) -> GroupResult: ...
```

All functions are pure (no I/O, no network, no clock; randomness only from `rng`/`seed`). `shared_interests` applies P1, P2 and P4 rules so the backend and the simulation reveal the same overlap.

## 11. Frontend extension points (added by PRD 4, used by PRD 1)

The shell agent adds these to the clone's registry (`facebook-clone/src/extensions/types.ts`) and platform layer. Common Ground registers through them and touches no clone file.

```ts
// Added to FeatureDefinition (all optional)
tabs?: TabItem[];             // at most one per feature; native bottom bar only
inboxSources?: InboxSource[]; // rows merged into the Messenger chat list (native)
eventSources?: EventSource[]; // rows merged into the Events screen (native)
resetHooks?: ResetHook[];     // run by Settings > Reset demo, after the core reset

export interface TabItem {
  id: string;
  label: string;               // short: one word
  href: string;                // e.g. '/common-ground'
  icon: string;                // Ionicons name, inactive
  activeIcon: string;          // Ionicons name, active
  after: '/' | '/friends' | '/marketplace' | '/notifications';  // position in the bar
  useBadge?: () => number;     // hook; 0 hides the badge
}
export interface ExternalRow {
  id: string;
  title: string;
  subtitle: string;
  time?: string;               // already formatted for display
  imageUri?: string | null;    // remote or local URI; null shows initials
  initials?: string;
  unread?: boolean;
  href: string;                // in-app route
}
export interface InboxSource { id: string; label: string; useRows(): ExternalRow[]; }
export interface EventSource { id: string; label: string; useRows(): ExternalRow[]; }
export interface ResetHook { id: string; run(): Promise<void>; }

// facebook-clone/src/platform/scopedStorage.ts (+ .web.ts)
export function createScopedStorage(key: string): StorageAdapter; // key matches /^[a-z0-9-]+:v\d+$/ and is not the core key
```

Hooks in `useBadge` and `useRows` are called on every render of their host screen, in registry order, so the number of sources never changes at runtime. On web, `tabs`, `inboxSources` and `eventSources` are ignored and Common Ground contributes only a Menu item to a placeholder page.

**App dependency allowlist.** The shell agent installs exactly these with `npx expo install` (SDK 57 versions, all bundled in Expo Go): `react-native-maps`, `expo-location`, `expo-blur`, `expo-haptics`. Nothing else may be added to `facebook-clone/package.json` without a contracts PR. Not allowed: `expo-maps` (not in Expo Go), Google map provider, background location, any native module outside Expo Go.

## 12. Environment, ports and commands

Copy `.env.example` to `.env` at the repo root (services) and `facebook-clone/.env` (Expo public vars).

| Var | Default | Used by |
| --- | --- | --- |
| `DEMO_MODE` | `1` | backend |
| `MODEL_API_KEY` | (secret) | backend, sim |
| `MUSE_BASE_URL` | `https://api.meta.ai/v1` | backend, sim |
| `MUSE_MODEL` | `muse-spark-1.3` (verify with `GET /v1/models`) | backend, sim |
| `MUSE_FAKE` | `0` (`1` = deterministic offline stub) | backend, sim |
| `LAYA_URL` | `http://127.0.0.1:8090` | backend, sim |
| `LAYA_MODEL` | `laya` | backend, sim |
| `LAYA_FAKE` | `0` (`1` = deterministic hash-based probabilities) | backend, sim |
| `CG_API_HOST` / `CG_API_PORT` | `0.0.0.0` / `8000` | backend public API (phones reach it on the LAN) |
| `CG_INTERNAL_HOST` / `CG_INTERNAL_PORT` | `127.0.0.1` / `9001` | backend internal API |
| `DATABASE_URL` | backend's choice | backend |
| `CG_DATA_DIR` | `<repo>/data` | backend, sim |
| `CG_CONTRACTS_DIR` | `<repo>/contracts` | backend, sim |
| `CG_INTERNAL_URL` | `http://127.0.0.1:9001` | sim, dashboard |
| `CG_DASHBOARD_HOST` / `CG_DASHBOARD_PORT` | `127.0.0.1` / `9100` | dashboard |
| `EXPO_PUBLIC_CG_API_URL` | `http://<laptop LAN IP>:8000` | app |
| `EXPO_PUBLIC_CG_USER` | `u_maya` | app (default identity) |

Standard commands (each owner provides its own; the root `Makefile` only calls these):

| Command | Owner | Does |
| --- | --- | --- |
| `cd services/api && uv run cg-api` | backend | public :8000 and internal :9001 listeners |
| `cd services/api && uv run cg-api-load-seed <poolId>` | backend | same as `POST /internal/v1/seed/load` |
| `cd services/sim && uv run cg-sim <seed\|eval\|precompute\|run\|report> ...` | sim | simulation pipeline |
| `cd services/dashboard && uv run cg-dashboard` | sim | dashboard on :9100 |
| `cd facebook-clone && npm start` | shell | Expo dev server for Expo Go |
| `make mock-api` | human | Prism mock of `openapi.yaml` on :8000 |

## 13. Change process

1. Changes to `contracts/` happen only on a `cg/contracts/...` branch, reviewed by the human.
2. Allowed in v1: new optional fields, new operations, new values in open enums, new taxonomy nodes, new activity types, new params keys, changed param values with evidence. Each needs the example in `openapi.yaml` updated and a line in the changelog below.
3. Not allowed in v1: removing or renaming anything, changing a type, tightening a request (new required field), changing what an ID means, changing a Laya template without bumping `questionsVersion`.
4. A consumer that needs something new opens the contracts PR first, then builds against the merged contract, with a fallback that hides the feature if the producer has not shipped it yet (tolerant reader rule 6).

### Changelog

- v1.0.0 (2026-11-12): initial contracts.
