# Common Ground contracts (v2)

This folder is the only thing the four agents share. If two agents follow these files, their work fits together without them talking to each other. Owned by the human integrator; changes follow [Change process](#13-change-process).

v2 (plans-first, visible Muse agent, connectors) replaces v1 wholesale. See [DESIGN](../docs/common-ground/DESIGN.md#what-changed-from-v2) for why. The URL prefix stays `/v1`; `apiVersion` is `"2"`.

Precedence when documents disagree: **contracts/** > [AGENT_RULES](../docs/common-ground/AGENT_RULES.md) > your PRD > [DESIGN](../docs/common-ground/DESIGN.md). For anything inside the existing Facebook clone, the clone's own `facebook-clone/docs/ARCHITECTURE.md` and `EXTENDING.md` also apply.

## 1. Files

| File | What it fixes | Producer | Consumers |
| --- | --- | --- | --- |
| `openapi.yaml` | Public API: app ↔ backend | backend | iOS |
| `openapi.internal.yaml` | Internal API: sim, dashboard, demo controls ↔ backend | backend | sim, dashboard |
| `params.yaml` | Every tunable number | human (sim proposes changes) | backend, sim; app via `/v1/config` |
| `modes.yaml` | Modes and pools | human | backend, sim |
| `connectors.yaml` | Connector providers, what each reads, signal kinds, demo status | human | backend, sim; app via `listConnectors` |
| `taxonomy.yaml` | Interest IDs, labels, sensitive flags | human | backend, sim |
| `laya_questions.yaml` | Every Laya question, state template, activity type and table format | human | backend, sim |
| `laya_golden.json` | Reference renders of Laya states; both renderers must match byte for byte | human | backend, sim |
| `openapi.json` | Generated JSON copy of `openapi.yaml` (`python scripts/build_openapi_json.py`); CI checks it is in sync | human | ios tests, mocks |
| `schemas/*.schema.json` | Seed files, demo identities, pool export | sim / backend | backend / sim |
| This file | Conventions, state machines, realtime, privacy guarantees, data layout, Python and TypeScript interfaces, env, commands | human | everyone |

## 2. Conventions

- **JSON:** camelCase keys. Timestamps ISO 8601 UTC with `Z`. Coordinates `{ "lat": 37.77, "lng": -122.42 }`. Money in integer cents plus an ISO currency code.
- **IDs:** opaque strings with a type prefix. Never parse them, never build them on the client.

  | Prefix | Thing | Prefix | Thing |
  | --- | --- | --- | --- |
  | `u_` | user (`u_maya`, `u_0042`) | `th_` | thread |
  | `pool_` | pool | `ms_` | message |
  | `pl_` | plan | `mt_` | meetup |
  | `jn_` | join (my I'm in on a plan) | `st_` | Muse step |
  | `ap_` | approval | `vn_` | venue |
  | `si_` | signal | `nd_` | nudge |
  | `mc_` | Muse bar conversation | `mm_` | Muse bar message |
  | `cn_` | connection (person met) | `sc_` | scene |
  | `rp_` | report | `cr_` | connector record (seed only) |
  | `sh_` | share (anonymous gallery post) | | |

  Interest IDs are taxonomy paths (`outdoors.climbing.bouldering`), not prefixed. Connector providers are the keys of `connectors.yaml` (`google_maps`), not prefixed. v1 prefixes `ob_ dr_ sg_ hi_ gr_ iv_ op_ om_ hx_` are retired and never reused.
- **Demo identity:** every public request carries `X-CG-User: <userId>`. v2 has no real authentication, so the backend refuses to start unless `DEMO_MODE=1`.
- **Maya:** the Facebook clone's viewer `maya` is Common Ground user `u_maya`. The app maps one to the other; the backend only knows `u_maya`.
- **Numbers:** clients never hardcode limits, sizes or intervals. They read `GET /v1/config` (`limits`, `features`, `modes`, `demo`), which the backend builds from `params.yaml` and `modes.yaml`:

  | `config` field | Source |
  | --- | --- |
  | `limits.feedMax` | `feed.size` |
  | `limits.sharedCoarseMax`, `limits.sharedFullMax` | `privacy.sharedCoarseMax`, `privacy.sharedFullMax` |
  | `limits.messageMaxChars` | `messages.maxChars` |
  | `limits.museAskMaxChars` | `muse.askMaxChars` |
  | `limits.groupSizeMin`, `limits.groupSizeMax` | `groups.strangerSizeMin`, `groups.sizeMax` (the user's own cap is `Me.capabilities.maxGroupSize`) |
  | `limits.openJoinsMax` | `plans.openJoinsMax` (the user's own cap is `Me.capabilities.openJoinsMax`) |
  | `limits.pollIntervalS`, `limits.feedRefreshS` | `client.pollIntervalS`, `client.feedRefreshS` |
  | `limits.calendarSyncMinIntervalS`, `limits.calendarHorizonDays` | `calendar.syncMinIntervalS`, `calendar.horizonDays` |
  | `limits.meetupStatusBeforeMin` | `meetups.statusWindowBeforeMin` |
  | `features.*` | `features.*` |
  | `modes[]` | `modes.yaml` pools; specced modes appear with `available: false` |
  | `demo.*` | internal demo state, defaults from `params.demo` and `demo.json` |
- **Text the user sees** from the server (`reason`, `label`, `museText`, Muse messages, step labels, approval titles and fallbacks, nudge copy) is final copy. Clients display it as is.
- **Simulated things are flagged in data, not in UI.** Connectors with `simulated: true`, bookings (`Booking.provider`) and payments (`Approval.simulated`, `config.demo.simulatedPayments`) are seeded demo stand-ins; the fields stay, but clients do not render demo labels. No real account, booking or money is ever touched.

## 3. Tolerant reader rules (every consumer)

These rules are what let each agent change its internals without breaking the others.

1. Ignore unknown JSON fields.
2. Treat an absent optional field and `null` the same.
3. Unknown enum value: render a neutral fallback (hide the badge, show generic text), never crash. Enums marked "Open enum" in the spec will grow.
4. Unknown `MessageAttachment.kind`, `MuseStep.kind`, `Approval.kind` or realtime `type`: skip it (an unknown step kind still renders its `label` and `status`).
5. Unknown error `code`: fall back on the HTTP status.
6. A `features.*` flag that is false or missing hides that surface completely.
7. Realtime events are hints. REST is the source of truth. After an event, refetch the resource it names.
8. Everything must work with realtime disconnected, by polling at `limits.pollIntervalS` (open thread, meetup in `setting_up`, pending approvals) and `limits.feedRefreshS` (feed, joins, nudges).
9. Long calls (`askMuse`, `createPlan`, `connectConnector`) can take 2 to 15 s. Show progress; time out at 30 s with a retry.
10. Muse steps are append-only. Render them in array order; never reorder or drop one.

Producers, in return, never remove or rename a field, never change a field's type, never reuse an ID, and only add enum values to enums marked open.

## 4. Public API map

The full shapes and examples are in `openapi.yaml`. Every endpoint is required for v2 unless its feature flag is off.

| Area | Operations | Flag |
| --- | --- | --- |
| System | `getHealth`, `getConfig`, `realtime` (WebSocket) | `realtime` for WS |
| Me and setup | `getMe`, `updateMe`, `setInterestVisibility`, `removeInterest`, `optIn`, `optOut`, `getSetup`, `completeSetup` | |
| Connectors | `listConnectors`, `connectConnector`, `disconnectConnector`, `listSignals`, `setSignalVisibility`, `deleteSignal`, `syncCalendar` | `connectors` |
| Muse bar | `askMuse` | |
| Plans | `getFeed`, `getPlan`, `createPlan`, `joinPlan`, `withdrawJoin`, `listJoins` | `userPlans` for `createPlan` |
| Nudges | `listNudges`, `dismissNudge` | `nudges` |
| Meetups | `listMeetups`, `getMeetup`, `leaveMeetup`, `setMeetupStatus`, `checkIn`, `sendFeedback` | `checkin` for the last two |
| Approvals | `listApprovals`, `decideApproval` | `payments` for `payment` approvals |
| People | `listConnections`, `getPerson` | |
| Chat | `listThreads`, `getThread`, `listMessages`, `sendMessage`, `markThreadRead` | |
| Safety | `report`, `block` | |
| Shares | `listShares` (no `X-CG-User` needed), `shareMeetup`, `likeShare` | |
| Verify | `verifyAttendee` | |

Retired from v1: `startOnboarding`, `sendOnboardingMessage`, `completeOnboarding`, `getDensity`, `getCurrentDrop`, `decideSuggestion`, `sayHi`, `listHi`, `replyHi`, `dismissHi`, `requestGroup`, `getGroupRequest`, `listInvites`, `decideInvite`, `planMeetup`, `voteMeetup`, `getMap`, `updateLocation`, `setLocationShare`, `setLocationView`, `setGhostMode`, `getSceneLeaderboard`, `followScene`.

## 5. State machines

The backend owns every transition. Clients render the state they are given and never infer a transition locally (optimistic UI is allowed if it is reconciled with the next fetch).

**Plan.** `open` (accepting joins) → `full` (reached `size.max` × the number of groups the venue can host; joined users keep seeing it) → `closed` (formed at `formsAt`, or immediately when full). Any state → `cancelled`. A plan with an `invite` origin is visible only to its invitees.

**Join (one per user per plan).** `interested` → `matched` (`form_groups` seated me; `meetupId` set) or `not_filled` (at formation I wasn't seated, for any reason; `alternatives` set) or `withdrawn` (I withdrew before formation; silent). A plan forms when it is full, or at `formsAt` (`startsAt − plans.formLeadHours`) if at least `size.min` joined, or in DEMO_MODE as soon as `size.min` joined (`plans.demoFormAtMin`). `not_filled` looks the same whatever the reason.

**Meetup (one per formed group).** `setting_up` (group revealed, thread open, Muse running steps) → `confirmed` (time and venue locked; booking `booked`, `pay_at_venue` or `not_needed`; Facebook Event created, `eventLabel` set) → `completed` (end time passed; `feedbackDue` true until feedback is sent). `confirmed` → `setting_up` again while Muse reschedules or backfills. Any state → `cancelled` (with alternatives posted in the thread). An attendee who leaves has `rsvp: left`.

**Muse step.** `queued` → `running` → `done` | `needs_you` (waiting on an approval; `approvalId` set) | `failed` (with what Muse did next as a new step) | `skipped`. `needs_you` → `running` after the approval is decided. Steps are append-only.

**Approval.** `pending` → `approved` | `declined` | `expired` (at `expiresAt`). Declined or expired runs the stated `fallback`. Muse never pays without an approved payment approval, unless the amount is at or below `Me.museSettings.spendWithoutAskingCents` (default 0); in that case the step reads "Paid $X (within your auto-spend limit)".

**Muse autonomy.** Muse acts without asking only inside these bounds (per-user settings in `Me.museSettings`, defaults from `params.muse`): calendar holds and events; opening the group chat; reminders; the Facebook Event; backfilling a seat (`autoBackfill`); rescheduling or swapping venue when every attendee stays free, the start moves by at most `muse.rescheduleWindowMin` on the same day and the cost does not rise (`autoReschedule`). Anything else is a `change` approval to each affected attendee. Muse never shares calendar contents or exact location.

**Connector.** `not_connected` → `connected` (`connectConnector`) → `not_connected` (`disconnectConnector`; every derived signal, busy block and evidence line is deleted). `coming_soon` is not selectable.

**Calendar directive (one per join or meetup on each attendee's device).** `hold` while my join is `interested` (if `museSettings.calendarHolds`) → `event` when my meetup is `confirmed` (and again with new times after a reschedule) → `none` when withdrawn, not filled, left or cancelled. The app reconciles its own "Common Ground" calendar and reports `applied` in the next `syncCalendar`; only then does Muse's `calendar` step become `done` for that attendee.

**Nudge.** Created from a strong visible signal (`params.nudges`), shown until `expiresAt`, dismissed, or its plan is joined. `dismissNudge` with `mute: signal` stops nudges from that signal.

**Connection.** Created for every pair in a formed group, `new` → `met` after the first meetup that counts (`params.checkin.meetupCountsWhen`). Only `met` people can be invited with `createPlan.inviteUserIds`, which is the only way to a one-to-one plan.

## 6. Realtime

`ws://<api-host>/v1/ws?user=<userId>`. Server → client frames are `RealtimeEvent` (`openapi.yaml` components): `{ "type", "eventId", "at", "data" }`. The client sends nothing but optional `{"type":"ping"}`; the server may send `{"type":"pong"}`. Reconnect with backoff (1, 2, 4, 8, max 15 s) and refetch everything visible after reconnecting.

| type | data | Client refetches |
| --- | --- | --- |
| `feed.updated` | `{}` | `/v1/feed` |
| `join.updated` | Join | `/v1/joins` (and the feed card's `myJoin`) |
| `meetup.updated` | Meetup | that meetup, `/v1/meetups` |
| `meetup.step` | `{ meetupId, step: MuseStep }` | merge the step by `stepId` (append if new), or refetch that meetup |
| `approval.requested` | Approval | `/v1/approvals`, that meetup |
| `nudge.created` | Nudge | `/v1/nudges` |
| `message.created` | Message | that thread's messages (or appends `data` if contiguous) |
| `thread.updated` | Thread | `/v1/threads` |
| `connection.created` | Connection | `/v1/connections` |
| `calendar.changed` | `{}` | call `syncCalendar` to receive new directives |
| `signals.updated` | `{}` | `/v1/signals`, `/v1/me/setup` |
| `me.updated` | `{}` | `/v1/me`, `/v1/config` |

`meetup.step` is what makes Muse's work visible live; emit one per step transition, after the state change is committed.

## 7. Errors

Envelope: `{ "error": { "code", "message", "retryable", "details"? } }`. `message` is safe to show.

| HTTP | code | When |
| --- | --- | --- |
| 400 | `validation_failed` | Bad body or parameters |
| 401 | `unauthenticated` | Missing or unknown `X-CG-User` |
| 403 | `not_allowed` | Not permitted (private profile, not in a group together, trust gate, inviting someone not `met`) |
| 403 | `not_opted_in` | Setup, connectors, feed, plans, nudges or the Muse bar before `optIn` |
| 404 | `not_found` | Unknown or no longer visible ID (including blocked people and other people's invite plans) |
| 409 | `conflict` | State changed (join a closed plan, decide an expired approval) |
| 422 | `screened` | A user-created plan or Muse bar request Laya or Muse screened out; `message` explains gently |
| 429 | `rate_limited` | Limits from params (open joins, plans per week, Muse bar rate) |
| 503 | `muse_unavailable`, `laya_unavailable`, `unavailable` | Dependency down; `retryable: true`. `askMuse` falls back to keyword filtering before returning this |

## 8. Privacy guarantees (server-enforced, tested)

The backend guarantees these on every response. The app relies on them and does not re-implement them. The backend agent writes one automated test per line.

- **P1 Overlap only.** No public response ever contains another user's interest that is not shared with the viewer, or any of their hidden interests.
- **P2 Two-stage reveal.** Before a group forms, no response identifies anyone else in a plan: `Crowd` carries only counts and at most `privacy.sharedCoarseMax` level-2 interests that the viewer also has, each with a count, and only when at least `privacy.crowdMinCount` people are in. After a group forms, its members see each other and level-3 shared interests, at most `privacy.sharedFullMax`.
- **P3 Private profiles.** For a private user, `displayName` is first name only and `avatarUrl` is null everywhere; `getPerson` returns 403.
- **P4 Sensitive interests and places.** An interest or signal with `sensitive: true` is never used for overlap with anyone unless both users opted that category in, never drives a nudge, and never appears in another user's response.
- **P5 No enumeration.** No public endpoint lists users or accepts a free user search. People reach a client only through a formed group (attendees, thread participants, connections).
- **P6 Invisible outcomes.** No response tells a user that someone withdrew, left for a reason, declined an approval, or why a join was `not_filled`. `leaveMeetup` tells the group only that the person can't make it.
- **P7 Owner-only signals.** Signals, `because` lines, busy blocks, connector records, evidence and calendar directives appear only in their owner's responses. Calendar directives never contain another user's name.
- **P8 No location tracking.** There is no location endpoint. Travel estimates use the user's neighborhood centroid; the check-in location is used only for that check-in and not stored beyond the result. Directions links contain only the venue's coordinates.
- **P9 Internal surfaces.** Nothing from `openapi.internal.yaml` is served on the public listener. Blocked users are removed from every public response of the blocker and are never placed in a group with them.
- **P10 Data stays home.** User data goes only to the configured Muse endpoint and the configured Laya endpoint. No other third party, including connectors, booking and payment, which are simulated inside the backend in v2.
- **P11 Money and actions.** No payment step completes without an approved `payment` approval from that user or an amount within their `spendWithoutAskingCents`. No change outside the autonomy bounds (§5) happens without a `change` approval.

## 9. Data layout

```
data/
  seed/<poolId>/                 written by sim, committed, read by backend
    pool.json                    schemas/pool.schema.json
    personas.jsonl               schemas/persona.schema.json, one object per line
    activity.jsonl               schemas/activity.schema.json (synthetic Facebook activity)
    connectors.jsonl             schemas/connector_record.schema.json (synthetic connector data, incl. busy blocks)
    venues.jsonl                 schemas/venue.schema.json (public places with simulated booking inventory)
    plans.jsonl                  schemas/plan.schema.json (initial plan inventory)
    demo.json                    schemas/demo.schema.json (pools used in the demo only)
    avatars/<userId>.(png|jpg)   + avatars/PROVENANCE.md
    venue_photos/<venueId>.(jpg|png)  + venue_photos/PROVENANCE.md (optional)
  sim_private/<poolId>/          written by sim, committed, read ONLY by sim and dashboard
    ground_truth.jsonl, latent.jsonl   (format is the sim's choice)
  laya_tables/<poolId>/          written by sim, committed, read by backend
    activity.parquet, meet_again.parquet, manifest.json   (laya_questions.yaml#tables)
  sim/runs/<runId>/              written by sim, read by dashboard (format is the sim's choice)
```

The backend must never open `data/sim_private/`. Seed and tables are deterministic for a given `rngSeed` and `questionsVersion`. A persona's `connectors.jsonl` records are inert until that user connects the provider; the backend activates the seeded records for synthetic users at load time according to each persona's `connectedProviders`.

## 10. Python interface: `cg_matching`

`packages/matching` (owned by the backend agent) is the single implementation of vectors, scenes, plan proposals, plan ranking, group formation and travel estimates. The backend uses it live; the simulation imports it to run the same policy. These signatures are frozen for v2; internals are free.

```python
# packages/matching/src/cg_matching/__init__.py
from cg_matching.types import (
    PoolSnapshot,   # PoolSnapshot.from_export(dict) accepts schemas/pool_export.schema.json
    Params,         # Params.from_yaml(path) reads contracts/params.yaml
    LayaTables,     # LayaTables.from_dir(path) reads data/laya_tables/<poolId>/; .p_join(u, t), .p_show(u, t), .p_meet_again(a, b)
    Venue,          # Venue.from_record(dict) accepts schemas/venue.schema.json
    Plan,           # Plan.from_record(dict) accepts schemas/plan.schema.json (plus live plans with the same fields)
    MatchState,     # today's plan exposures, open joins, met pairs, blocked pairs, seat history;
                    # .prefs: dict[str, dict[str, float]] user -> key -> w in [-1, 1] (optional, default {}; added batch 2)
    PlanScore,      # user_id, plan_id, score, shared_coarse: list[str], travel_minutes: int, debug: dict
    GroupResult,    # plan_id, member_ids, min_pairwise
    FormResult,     # groups: list[GroupResult], unseated_ids: list[str]
)

def build_vectors(pool: PoolSnapshot, params: Params) -> "Vectors": ...
def candidates(pool: PoolSnapshot, vectors: "Vectors", params: Params) -> dict[str, list[tuple[str, float]]]: ...
def scenes(pool: PoolSnapshot, cands: dict[str, list[tuple[str, float]]], params: Params, seed: int) -> dict[str, str]: ...
def shared_interests(pool: PoolSnapshot, a: str, b: str, level: int, limit: int) -> list[str]: ...
def plan_overlap(pool: PoolSnapshot, user_id: str, plan: Plan, joined_ids: list[str], level: int, limit: int,
                 *, params: Params | None = None) -> list[tuple[str, int]]: ...   # params optional (added 2026-11-12); pass it to stay pure
def travel_minutes(origin: tuple[float, float], dest: tuple[float, float], mode: str, params: Params) -> int: ...
def propose_plans(pool: PoolSnapshot, venues: list[Venue], scene_of: dict[str, str], params: Params,
                  rng: "random.Random", horizon_start: "datetime") -> list[Plan]: ...
def rank_plans(pool: PoolSnapshot, plans: list[Plan], vectors: "Vectors", venues: dict[str, Venue], tables: LayaTables,
               state: MatchState, params: Params, rng: "random.Random") -> dict[str, list[PlanScore]]: ...
def form_groups(plan: Plan, interested_ids: list[str], pool: PoolSnapshot, cands: dict[str, list[tuple[str, float]]],
                tables: LayaTables, state: MatchState, params: Params, rng: "random.Random") -> FormResult: ...
def update_prefs(prefs: dict[str, float], keys: list[str], r: float, alpha: float) -> dict[str, float]: ...
    # added batch 2; returns a new dict, w = (1 - alpha) * w + alpha * r for each key
```

Preference keys are `act:<activityType>`, `vn:<venueId>` and `int:<level-2 interest ID>`. `rank_plans` multiplies a plan's base score by `1 + params.matching.prefBoost * mean(w over the plan's keys present in state.prefs[user])` before the fill and allocation passes; with empty `prefs` its output is identical to before. `PlanScore.debug["pref_keys"]` lists the keys that applied.

All functions are pure (no I/O, no network, no clock; randomness only from `rng`/`seed`; times come in as arguments). `shared_interests` and `plan_overlap` apply P1, P2 and P4 so the backend and the simulation reveal the same overlap. `plan_overlap` returns `(level-2 interest ID, count of joined users who have it)` for interests the viewer also has, which is exactly what `Crowd.sharedWithYou` shows. `rank_plans` applies calendar and travel hard filters from `pool` (busy blocks, neighborhood centroid, travel prefs).

## 11. Frontend extension points (added by PRD 4, used by PRD 1)

The shell agent adds these to the clone's registry (`facebook-clone/src/extensions/types.ts`) and platform layer. Common Ground registers through them and touches no clone file. They are unchanged from v1.

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
  headerAction?: { icon: string; label: string; href: string };  // top-bar button shown beside search while this tab is open
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
// facebook-clone/src/extensions/story.ts (v2.1.3): post to the viewer's own Facebook story
export function usePostStory(): (input: { image: string; text?: string }) => Promise<string | null>;
// image: a clone media key (`@/data/media`) or an http(s) photo URL from EXPO_PUBLIC_CG_API_URL.
// Native copies a URL into the clone's own photo storage; web accepts keys only.
// text is trimmed and capped at 500. Resolves to the new story id, or null when nothing was posted.
```

Hooks in `useBadge` and `useRows` are called on every render of their host screen, in registry order, so the number of sources never changes at runtime. On web, `inboxSources` and `eventSources` are ignored; `tabs` appear as an extra desktop header destination (human decision 2026-11-12) and Common Ground also contributes a Menu item; its screens run on the in-app mock only.

**App dependency allowlist.** The shell agent installs exactly these with `npx expo install` (SDK 57 versions, all available in Expo Go):

| Package | Used for | Limits |
| --- | --- | --- |
| `expo-calendar` | Read busy blocks; write the app's own "Common Ground" calendar | Never read titles, notes, locations or attendees; write only to the calendar the app created |
| `expo-notifications` | Local notifications: leave-by and day-of reminders | Local only; no push token is requested or sent anywhere |
| `react-native-maps` | Static venue preview on the plan pop-up and meetup screen | Apple Maps provider only; no user location layer |
| `expo-location` | One reading when the user taps Check in | When-in-use only; never in the background; skipped when `demo.fakeLocation` is set |
| `expo-blur` | Pop-up and sheet backgrounds | |
| `expo-haptics` | Group-formed and approval feedback | |
| `expo-camera` | Scan another attendee's verify QR (`CameraView` with `onBarcodeScanned`) | Only on the scan screen, only after the user taps; no photos or video are saved or sent |
| `qrcode-generator` | Draw my verify QR as a View grid | Pure JS, no native module |

Directions use React Native's built-in `Linking` to open the `Directions` URLs. Nothing else may be added to `facebook-clone/package.json` without a contracts PR. Not allowed: `expo-maps` (not in Expo Go), Google map provider, background location, push notifications, any native module outside Expo Go, any share extension (needs a development build).

## 12. Environment, ports and commands

Copy `.env.example` to `.env` at the repo root (services) and `facebook-clone/.env` (Expo public vars).

| Var | Default | Used by |
| --- | --- | --- |
| `DEMO_MODE` | `1` | backend |
| `MODEL_API_KEY` | (secret) | backend, sim |
| `MUSE_BASE_URL` | `https://api.meta.ai/v1` | backend, sim |
| `MUSE_MODEL` | `muse-spark-1.3` (verify with `GET /v1/models`) | backend, sim |
| `MUSE_FAKE` | `0` (`1` = deterministic offline stub; the agent uses the scripted planner) | backend, sim |
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
| `EXPO_PUBLIC_CG_MOCK` | `0` (`1` = in-app fixtures) | app |

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
2. Allowed within v2: new optional fields, new operations, new values in open enums, new taxonomy nodes, new activity types, new connector providers, new params keys, changed param values with evidence. Each needs the example in `openapi.yaml` updated and a line in the changelog below.
3. Not allowed within v2: removing or renaming anything, changing a type, tightening a request (new required field), changing what an ID means, changing a Laya template without bumping `questionsVersion`.
4. A consumer that needs something new opens the contracts PR first, then builds against the merged contract, with a fallback that hides the feature if the producer has not shipped it yet (tolerant reader rule 6).
5. A new major version (like v1 → v2) is a human decision, recorded in DESIGN and here, and is the only time rule 3 is suspended.

### Changelog

- v2.1.3 (2026-11-13, batch 5): `usePostStory` from `@/extensions/story` (§11, R1), so Common Ground can offer to post a completed meetup to the user's own story. Additive.
- v2.1.2 (2026-11-12, batch 4): optional `TabItem.headerAction` (§11), a top-bar button shown beside search while the tab is open; the shell also titles the top bar with the tab label. Additive.
- v2.1.1 (2026-11-12, batch 4): demo labels are flagged in data, not rendered (§2, Decisions). No API change.
- v2.1.0 (2026-11-12, batch 2): shares (`Share`, `listShares`, `shareMeetup`, `likeShare`, prefix `sh_`), `verifyAttendee` with optional `Meetup.verifyCode` and `Attendee.verified`, optional `Feedback.rating` and `Feedback.tags`, connectors `luma` and `beli`, params `matching.prefBoost`, `matching.prefAlpha`, `shares.galleryMax`, §10 `MatchState.prefs` and `update_prefs`, allowlist `expo-camera` and `qrcode-generator`.
- v2.0.0 (2026-11-12): plans-first redesign after judge feedback. Plans, joins, group formation from joins, the Muse bar, the visible Muse agent (steps, approvals, simulated booking and payments, autonomy settings), connectors and signals, nudges, device calendar sync and directives, travel estimates and directions. Removed the people drop, openers, group requests, voting, the map and location sharing, density and the scene leaderboard. `questionsVersion` 2. New `connectors.yaml` and seed files `connectors.jsonl`, `venues.jsonl`, `plans.jsonl`; `onboarding.jsonl` retired. App allowlist adds `expo-calendar` and `expo-notifications`.
- v1.0.0 (2026-11-12): initial contracts.

## Decisions (integrator, 2026-11-12)

Resolved open questions from the v2 build. Additive only; nothing renamed or tightened.

- **Timezone.** Every local time (venue hours, plan starts, routines, calendar) is `America/Los_Angeles`.
- **Plan horizon anchor.** "At least 12 hours after the demo day" means plan `startsAt` >= `2026-11-13T12:00:00-08:00`.
- **Plan titles.** Producers write at most 60 characters (PRD); the schema's 80 stays as the hard cap.
- **Nudge plan origin.** `nudgePlanId` has `origin: signal`.
- **Event pool nudge.** In `pool_evt_closer_together`, `nudgePlanId` is any free plan in the pool window; the "Maya's frequent place" rule applies to `pool_sf_city` only. `u_maya` connector records in a pool without her persona are ignored by the backend.
- **Nudge venue (batch 5).** Maya's frequent place in `pool_sf_city` is the fictional Little Fern Kitchen (Hayes Valley, Californian small plates); the nudge plan is a pay-at-venue table for 4 at 7 PM, so the demo shows Muse reserving a table. "Maya's frequent place" rule unchanged; "free" relaxed to "no payment approval".
- **Demo plans.** `heroPlanId`, `nudgePlanId` and the third featured plan may be hand-built by the sim seed (origin `seed`/`signal`) instead of `propose_plans`; all other seed plans come from `cg_matching.propose_plans`.
- **Matching stand-in.** Until `packages/matching` lands on main, `services/sim` may use its own `matching_adapter.py` fallback with the §10 signatures (R3 exception). Delete it and depend on `packages/matching` once that merges.
- **`config.demo.stepDelayS`.** Added as optional; mirrors `params.demo.stepDelayS`.
- **Laya answer fields.** Still unverified (no `laya-serve` docs here). Each service keeps the field mapping in one `LayaClient` adapter and fails loudly (>5% fallbacks) rather than faking silently.


- **Rewards (2026-11-12).** Optional `Me.rewards` { confirmedMeetups, streakWeeks, nextUnlock } from `params.unlocks`; private to the user, never shown to others or used in ranking. "Surprise me" is client-only: it opens a random not-joined plan from the viewer's own `getFeed` (already tailored); no new endpoint.
- **Quests and Passport (batch 2).** Client-only, like Surprise me: derived from the user's own joins, messages, meetups and local flags; no new endpoint, never sent to the server or shown to others.
- **Shares are anonymous (batch 2).** A `Share` has no person fields and uses the venue photo only, because a user photo can show attendees who did not consent. Sensitive venues can't be shared (422).
- **Verification by QR (batch 2).** NFC is not possible in Expo Go, so "tap phones" is "show my code, scan theirs" with the same 6 characters printed for typed entry (web, simulator, denied camera). One accepted scan verifies both people server-side and counts the meetup for both.
- **Reunion and crowd boosts (§10).** `matching.reunionBoost` (plans a met person already joined; `form_groups` also seats met pairs together) and `matching.crowdBoost` (plans already filling, scaled by joins / `size.min`) are multipliers in `rank_plans`. Both default to 0.0, which leaves output byte-identical to before; values change only through a contracts PR with sim evidence. `isolationBoost` multiplies every candidate score for an isolated user, so it only changes who wins contested exposure slots and seats, not the order of that user's own feed.
- **Fill to max (§10).** `matching.fillToMax` (default `false`) lets `cg_matching` keep filling a plan toward `size.max` instead of `size.min`. With `false`, or the key absent, output is byte-identical to before. It changes only through a contracts PR with sim evidence.
- **Isolation params adopted (2026-11-12).** `matching.fillToMax: true`, `reunionBoost: 1.0`, `crowdBoost: 0.5` from sim run 20261113T011854Z_pool_sf_city_grid (#62): selected on seeds 0-9, confirmed on held-out seeds 10-59 in all 25 sweep cells, Common Ground's low-outgoing isolation improves 1.6-5.6 pts vs the previous params with fill -1.9 to -2.3 pts. Still worse than greedy (24/25 cells, 1 unclear). Fake-Laya tables: suggestive, not evidence; the effect is largely mechanical (fuller groups, more repeat pairs). Revisit with real Laya tables.
- **Demo labels removed (batch 4, human decision).** The app no longer shows "Demo data", "Simulated booking" or "Demo payment" labels; `simulated` flags stay in the data. Disclosure lives in the pitch and README. Venue phone booking by Muse is shown only as a "Coming soon" teaser (UI only, no data, no telephony).
- **Stories after the event (batch 5).** After a completed meetup I went to, the app may offer, never auto-post, to add it to my own Facebook story: the venue photo and the plan title only, never attendees' names, photos, ids, count or chat. Same rule as shares: sensitive venues are never offered. The client cannot see venue sensitivity, so it shows the offer only when `venue.photoUrl` is set, and producers keep `photoUrl` null for sensitive venues (true in today's seed). Dismissal is a local own-prefs flag (C1).
