# Common Ground — Frontend-only build plan (mock-first, ponytail)

Repo root: `/Users/ayush/Downloads/My Projects/Hackathons/Meta-Closer-AI-Hackathon-2026`
App: `<root>/facebook-clone` (all paths below are relative to it unless absolute). Specs: `<root>`.

The plan is based on a read of the PRDs, contracts and clone source. Nothing was built or run except two read-only probes (Node version, and whether `tsx` can load `react-native`).

## 0. Findings that shape the plan

### Mismatches between the PRDs and the repo

1. **Contracts path.** (Resolved 2026-11-12: specs moved to repo root.) PRDs say `contracts/...` at repo root. They actually live at `<root>/contracts/`. From a test in `facebook-clone/tests/common-ground/`, the spec is `path.resolve('../contracts/openapi.json')` (tests run with cwd `facebook-clone`, as `tests/state.test.ts` already assumes).
2. **No backend tooling.** (Layout resolved 2026-11-12; `services/` still pending.) `make mock-api`, `scripts/check_ownership.py` and the Makefile lived in `common-ground-prds/`, and its `app` target `cd facebook-clone` is wrong from there. There is no `services/`. Ignore Prism; the in-app mock is the only data source.
3. **Dependencies are not installed.** `react-native-maps`, `expo-location`, `expo-blur` and `expo-haptics` are absent from `node_modules`.
4. **`npm test` cannot load React Native.** It runs `tsx --test`, and `tests/features.test.ts` imports `src/extensions/registry.ts`. I confirmed `tsx -e "require('react-native')"` crashes. So everything statically reachable from `feature.ts` (`feature.ts`, `store.ts`, `api.ts`, `mock.ts`, `types.ts`) must not import `react-native`, `expo-*`, `@/ui/native`, `@/platform/scopedStorage` or AsyncStorage at module top level. Use a lazy `require()` inside functions, with the same eslint-disable comment `src/data/media.ts` uses.
5. **Jest has no `@/` alias.** `jest.config.cjs` has no `moduleNameMapper`. Code inside `src/features/common-ground/` uses relative imports (`../../ui/native`), as every clone feature does. Only `src/app/**` route files use `@/features/...`.
6. **The clone `Avatar` cannot show API people.** It takes a local media key via `imageSource`, not a URL, and PRD-1 §2 lists it as reusable. Common Ground needs its own `PersonAvatar` (expo-image) that copies the Avatar styling.
7. **Spec example avatars will not load.** They point at `http://localhost:8000/static/avatars/...`. Mock fixtures use an `asset:<mediaKey>` URL instead, resolved through `imageSource` from `src/data/media`. Use the non-friend faces `kai`, `lucas`, `ava` (from `seed.suggestions`) so Maya's existing friends do not reappear as strangers. Known compromise: Kai, Lucas and Ava are named people in the clone's suggestions list.
8. **Shell hooks order.** `src/ui/Shell.tsx` returns `<Busy/>` before rendering; contributed `useBadge` hooks must be called before that return.
9. **`react-native-maps` breaks the web bundle if imported.** Web must resolve `src/features/common-ground/index.web.tsx`, following the existing `messenger/index.web.ts` pattern, so no native screen file enters the web build.
10. **Script globs.** `npm test` is `tsx --test tests/*.test.ts`; Node here is v26, so the quoted glob `"tests/**/*.test.ts"` works. Jest `testMatch` is `tests/native/**` and must widen to `tests/**/*.test.cjs`.
11. **e2e is in PRD-4 but not in your Phase 3 list.** PRD-4's done list includes `npm run test:e2e` (Playwright). The web Menu gains one item, so run it once in Phase 3.

### Deliberately minimal (say so in STATUS.md)

- **WebSocket realtime:** skipped. Polling only (tolerant-reader rule 8 allows it); the mock config sets `features.realtime: false`.
- **Leaderboard and unlocks (§7.6):** skipped; both flags are false. No `getSceneLeaderboard`, `followScene` or `getHealth` client functions.
- **Decoders:** no schema library. TS interfaces plus tiny normalisers that default required arrays to `[]`. Unknown enums are handled by lookup-with-fallback at render.
- **Finder dismissal:** close button only, no swipe gesture.
- **Friend sheet:** the clone's `Sheet` (iOS pageSheet Modal, which already swipes down). No custom bottom sheet, no snap points.
- **Celebration:** one haptic plus a static card. No animation, so reduced motion is trivially satisfied.
- **Real GPS:** about 8 lines behind a lazy `require('expo-location')`. The mock sets `demo.fakeLocation`, so permission is never requested (C2).
- **Second-phone identity:** `/common-ground/demo?as=` stores the override and shows the banner. The mock only swaps `Me.displayName`; it does not simulate a second user's world.
- **Real HTTP path:** one roughly 25-line `fetch` branch in `request()`. Mock is the default whenever `EXPO_PUBLIC_CG_API_URL` is unset or `EXPO_PUBLIC_CG_MOCK=1`.
- **Tests:** only what PRD-1 §9 names. No chat or settings component tests.
- **Perf, Dynamic Type audit, optional size/note UI on planMeetup:** skipped.

### Design language: what every Common Ground screen must reuse

Source of truth: `src/ui/tokens.ts`, `src/ui/native.tsx`, `docs/VISUAL_SPEC.md`.

- **Colors:** only `const c = useColors()` (`canvas`, `card`, `input`, `text`, `secondary`, `divider`, `blue`, `brand`, `online`, `badge`). The only literals allowed are ones the clone already uses:
  - `#fff` on blue.
  - Selected-chip background `#e7f3ff` (light) / `#263951` (dark).
  - Warning banner `#fff2d2` / `#634100`.
  - Shadow `#000`.
- **Type:**
  - `Label`: 15/21 body.
  - `Muted`: 13/18 secondary.
  - `Title`: 25/31/800, padding 16.
  - Section heading: `Label` 19/700 with a `Muted` line under it.
  - Card title: 21/27/700.
  - Row title: 16/700 or 600.
  - Metadata: 10–13.
- **Surfaces:**
  - `Page` (ScrollView, gap 8, paddingBottom 24).
  - `Card` (`c.card`, radius 8); full-bleed header cards use `style={{ borderRadius: 0 }}`.
  - Inner padding 16, gaps 7–14.
  - `Divider` hairline.
- **Controls:**
  - `Button`: minHeight 42, radius 7; primary is blue, `secondary` is `c.input`.
  - `IconButton`: 44×44.
  - `Input`: pill, radius 22, minHeight 44.
  - `Chips`: single-select pills, minHeight 40, radius 22.
  - `Switch` with `trackColor={{ true: c.blue, false: c.divider }}`.
  - Radio cards: borderWidth 1, radius 10, border `c.blue` when selected, `radio-button-on/off` icon.
- **Overlays:** `Sheet` (close X left, centered 18/700 title, hairline), `Alert.alert` for destructive confirms, `reportError` for thrown errors.
- **Empty and not-found:** `Empty` plus a secondary `Button`, as in Messenger's "Conversation not found" and Events' "Event not found".
- **Badges:** the Shell tab badge style (`c.badge`, radius 10, white 10/700).
- **Navigation:** `go(href)` and `router.replace`. Icons are Ionicons via `Icon`.
- **Header:** never draw one. The Shell provides the logo header on the tab root and back arrow plus "Map" on detail routes.
- **Keyboard:** `KeyboardAvoidingView` with `keyboardVerticalOffset={useKeyboardOffset()}`.

| Common Ground surface | Visual reference in the clone |
| --- | --- |
| Chat | `src/features/messenger/Screen.tsx`, detail branch |
| Meetup | `src/features/secondary/Screen.tsx`, events branch (`src/app/events.tsx`) |
| Settings | `src/features/settings/Screen.tsx` |
| Friend sheet, Say hi composer | `Sheet` in `src/ui/native.tsx`; Messenger composer row |
| Tray rows, Waiting-for-you rows, sharing list | Messenger chat-list rows |
| Finder cards, Home card | `Card` patterns in `src/features/friends/Screen.tsx` (request card with two buttons) |
| Mode tiles, floating map buttons | `src/features/menu/Screen.tsx` tile (radius 9, shadow opacity 0.1, radius 3) |
| Error and demo banner | Shell error banner in `src/ui/Shell.tsx` |
| Web placeholder | `src/features/post/Screen.web.tsx` (`narrow-page`, `PageTitle`, `Empty` from `ui/Controls.web`) |

---

## Phase 0 — Shell seams (one agent, sequential)

**Brief (paste as prompt):**

Work in `/Users/ayush/Downloads/My Projects/Hackathons/Meta-Closer-AI-Hackathon-2026/facebook-clone`. Implement PRD-4 steps 1–8 (`../docs/common-ground/PRD-4-facebook-shell.md`, with types copied verbatim from `../contracts/CONTRACTS.md` §11). Build no Common Ground UI and create nothing under `src/features/common-ground`, `src/app/common-ground` or `tests/common-ground`. Use the smallest diffs possible and change no existing behaviour.

Files to change:

1. **`package.json`, `package-lock.json`, `app.json`**
   - Run `npx expo install react-native-maps expo-location expo-blur expo-haptics`.
   - Add the plugin `["expo-location", { "locationWhenInUsePermission": "Common Ground uses your location to show friends who share theirs with you." }]` to `app.json`.
   - Scripts: `"test": "tsx --test \"tests/**/*.test.ts\""`. `test:native` is unchanged.
2. **`jest.config.cjs`** — `testMatch: ['<rootDir>/tests/**/*.test.cjs']`.
3. **`src/extensions/types.ts`**
   - Add and export `TabItem`, `ExternalRow`, `InboxSource`, `EventSource`, `ResetHook` exactly as in §11.
   - Add optional `tabs`, `inboxSources`, `eventSources`, `resetHooks` to `FeatureDefinition`.
4. **`src/extensions/registry.ts`**
   - `collectFeatures` also returns `tabs`, `inboxSources`, `eventSources`, `resetHooks` (flatMap); keep the duplicate-ID check.
   - Export the four new collections from the bottom destructure.
   - Do not register Common Ground; Phase 1 does that.
5. **`src/platform/scopedStorage.ts` and `src/platform/scopedStorage.web.ts`**
   - Export `createScopedStorage(key: string): StorageAdapter` (the type is in `src/core/persistence.ts`).
   - Throw if the key does not match `/^[a-z0-9-]+:v\d+$/` or equals `STORAGE_KEY` from `src/core/model.ts`.
   - Mirror the existing `storage.ts` and `storage.web.ts`, about 10 lines each.
6. **`src/ui/Shell.tsx`**
   - Build the tab list by inserting each contributed tab after the core tab whose `href === tab.after`.
   - Call every `useBadge?.()` unconditionally on every render, before the `if (!demo.ready)` return.
   - Render the badge with the existing notifications badge style.
   - `topLevel` includes contributed hrefs.
   - Detail title: paths under a contributed `href` show that tab's `label`.
   - Keep 26 pt icons and add `numberOfLines={1}` to tab labels; six tabs must fit at 390 pt.
7. **`src/features/messenger/Screen.tsx`** (native only)
   - Call every `inboxSources[].useRows()` at the top of the component, unconditionally.
   - In the list branch, above the seeded chats and for each source with rows, render a section heading (`Label` 17/700, padding 16) and rows in the existing row layout:
     - 54 pt circle: RN `Image` with `{ uri }` when `imageUri` is set, otherwise an initials circle on `c.input`.
     - Title 16/700, `Muted` subtitle with `numberOfLines={1}`, `Muted` time.
     - 10 pt `c.blue` dot when `unread`.
     - `onPress={() => go(row.href)}`.
8. **`src/features/secondary/Screen.tsx`** (native only) — same hook rule. On `/events` without `?event=`, render each `eventSources` source with rows as a `Card` (heading plus the same row layout) above the seeded events.
9. **`src/core/store.tsx`**
   - In `reset()`, after the core reset succeeds, run each `resetHooks[].run()` in its own try/catch.
   - On failure, `setError('Demo was reset, but <id> data could not be cleared. Try resetting again.')`; do not rethrow or undo.
   - This one edit covers the native and web Settings screens; do not touch either Settings screen.
10. **`tests/features.test.ts`**
    - Extend the fixture with one tab, one inbox source, one event source and one reset hook; assert they are collected.
    - Change the `homeSections.length === 0` assertion to filter on core features only (`features.filter(f => f.id !== 'common-ground')`).
11. **`docs/COMMON_GROUND_SHELL_STATUS.md`** — about 10 lines: what changed, and that reset hooks run from the core store.

Web gets no change to `Shell.web.tsx`.

Done when `npm test`, `npm run test:native`, `npm run typecheck`, `npm run lint`, `npx expo install --check`, `npm run build:web` and `npm run build:ios` pass.

---

## Phase 1 — Common Ground foundation (one agent, after Phase 0)

**Brief (paste as prompt):**

Work in `/Users/ayush/Downloads/My Projects/Hackathons/Meta-Closer-AI-Hackathon-2026/facebook-clone`. Read `../docs/common-ground/PRD-1-ios-common-ground.md` §3–6 and §9, `../contracts/CONTRACTS.md` §2, §3, §5, §7 and §11, `../contracts/openapi.json`, and `AGENT_RULES.md` R7 and R12.

There is no backend. Build the data foundation and placeholder screens so five UI agents can work in parallel on disjoint files. The exported API below is frozen; implement it exactly.

Hard rules:

- `types.ts`, `api.ts`, `mock.ts`, `store.ts` and `feature.ts` must import nothing from `react-native`, `expo-*`, `../../ui/*` or `../../platform/*` at module top level. `npm test` loads them in plain Node through the registry. Use a lazy `require()` inside functions with an eslint-disable comment.
- Use relative imports only inside the feature folder.
- Do not add packages.
- Never write other people's data to storage (C1).

### Files in `src/features/common-ground/`

**`types.ts`**

- Hand-written interfaces named exactly like the OpenAPI schemas: `Config`, `ModeInfo`, `Mode`, `LatLng`, `InterestRef`, `MyInterest`, `AvailabilitySlot`, `GroupSize`, `Me`, `MeUpdate`, `OnboardingSession`, `OnboardingMessage`, `OnboardingComplete`, `Density`, `DensityBin`, `PersonCard`, `DropCard`, `Drop`, `DecisionResult`, `HiResult`, `HiItem`, `GroupRequest`, `Invite`, `LocationShareState`, `Connection`, `PublicProfile`, `Thread`, `Message`, `MessageAttachment`, `Venue`, `MeetupOption`, `Attendee`, `Meetup`, `CheckinResult`, `Feedback`, `FriendPin`, `TrayItem`, `MeetupPin`, `MapView`, `ReportRequest`.
- Open enums are typed as `string` unions with `| (string & {})`.
- Export `decoders: Record<string, (json: unknown) => unknown>` keyed by `operationId`. Each shallow-copies and defaults required arrays to `[]` (`Config.modes`, `Me.interests/availability/unlocks`, `OnboardingSession.messages/proposedInterests`, `Density.bins`, `Drop.cards`, list `.items`, `Thread.participants`, `Message.attachments`, `Meetup.options/attendees`, `MapView.friends/tray/meetups`, `*.sharedInterests`). Never throw on unknown fields, enum values or attachment kinds.

**`mock.ts`**

- `export function mockRequest(userId: string, method: string, path: string, body?: unknown): Promise<unknown>` and `export function resetMock(): void`.
- An in-memory fake server over one mutable state object seeded from the `openapi.json` examples (copy them in; Metro cannot bundle outside the app).
- Time-based transitions use timestamps compared on read, never `setTimeout`, so Node tests do not hang.
- Set avatars to `asset:kai`, `asset:lucas`, `asset:ava`, or `null`.
- Scripted world:
  - **Config:** the spec example with `demo: { enabled: true, fakeLocation: { lat: 37.7694, lng: -122.4862 }, counterpart: 'synthetic', relaxCheckin: true }` and `features.realtime: false`, `leaderboard: false`, `unlocks: false`.
  - **Me:** starts `optedIn: false`. `optIn` sets mode and pool. `u_0042` gets `displayName: 'Daniel Okafor'`.
  - **Onboarding:** `startOnboarding` returns the example. Each `sendOnboardingMessage` appends the user message and a canned Muse reply. After the third user turn, `status` is `review` with about 7 `proposedInterests` across 3 categories; one is `sensitive: true, visibility: 'hidden'` (pick a real sensitive node from `../contracts/taxonomy.yaml`). Also return `proposedGroupSize` and `proposedAvailability`. `completeOnboarding` returns Me.
  - **Density:** `totalLooking: 214`, 6–8 hex bins around SF.
  - **Drop:** 5 cards. `sg_0001` is Daniel Okafor (public, `u_0042`). One card is private (`displayName: null`, `avatarUrl: null`). All have `hiAvailable: true`, at most 3 level-2 interests and a reason.
  - **`decideSuggestion`:** `pass` returns `passed`. `connect` on `sg_0001` returns `connected` with a Connection (`cn_0001`, `th_0001`) and creates the thread with the Muse intro and `starters` attachment from the spec example, plus a tray item with `reason: 'not_met'`. `connect` on any other card returns `connect_sent`.
  - **`sayHi`:** `delivered`, except text containing `http` returns `rejected` / `screened`.
  - **Openers:** `listHi` has one opener from a private person. `replyHi` returns a Connection and thread. `dismissHi` removes it.
  - **Invites and groups:** `listInvites` has one pending invite; accepting it creates group thread `th_0002`. `requestGroup` returns `inviting`; `getGroupRequest` returns `formed` with a `threadId` after 3 s.
  - **Messages:** `sendMessage` returns the message with `clientId`. About 2 s later a canned reply from the other person appears in `listMessages`, and `unreadCount` and `lastMessage` are maintained. `markThreadRead` zeroes the count.
  - **`planMeetup`:** returns `proposing` and sets `thread.activeMeetupId`. After 2.5 s `getMeetup` returns `voting` with the 3 spec-example options, and a Muse message with a `meetup` attachment is added to the thread.
  - **`voteMeetup`:** records `myVote` and counts. Once I vote yes on any option, the first such option wins: `confirmed`, `title`, `venue`, `startsAt = now + 30 min`, `endsAt = +2 h`, `checkinWindow` open now, `eventLabel`, attendees with RSVP yes, and a `MeetupPin` on the map.
  - **Status, check-in, feedback:** `setMeetupStatus` sets my attendee status; the other attendee shows `on_my_way`. `checkIn` returns `{ accepted: true }` and then flips the meetup to `completed` with `feedbackDue: true`. `sendFeedback` sets `feedbackDue: false`, sets the connection to `met`, and moves Daniel from tray to `friends` as a `neighborhood` pin with `radiusM: 800`.
  - **Location and safety:** `setLocationShare`, `setLocationView` and `setGhostMode` mutate and return state. `report` returns `{ reportId }`. `block` removes the person everywhere.
  - **Unknown IDs:** throw `{ status: 404, error: { code: 'not_found', message: 'That person is no longer available.', retryable: false } }`.

**`api.ts`**

```ts
export class CgError extends Error { code: string; status: number; retryable: boolean }
export const MOCK: boolean; // EXPO_PUBLIC_CG_MOCK === '1' || !EXPO_PUBLIC_CG_API_URL
export function setUser(userId: string | null): void; // null -> EXPO_PUBLIC_CG_USER ?? 'u_maya'
export function getUser(): string;
export const api: {
  getConfig(): Promise<Config>; getMe(): Promise<Me>; updateMe(patch: MeUpdate): Promise<Me>;
  setInterestVisibility(interestId: string, visibility: 'shown' | 'hidden'): Promise<MyInterest>;
  removeInterest(interestId: string): Promise<void>;
  optIn(mode: Mode, poolId?: string): Promise<Me>; optOut(): Promise<void>;
  startOnboarding(): Promise<OnboardingSession>;
  sendOnboardingMessage(sessionId: string, text: string): Promise<OnboardingSession>;
  completeOnboarding(sessionId: string, body: OnboardingComplete): Promise<Me>;
  getDensity(poolId: string): Promise<Density>; getCurrentDrop(): Promise<Drop>;
  decideSuggestion(suggestionId: string, decision: 'connect' | 'pass'): Promise<DecisionResult>;
  sayHi(suggestionId: string, text: string): Promise<HiResult>;
  listHi(): Promise<HiItem[]>; replyHi(hiId: string, text: string): Promise<Connection>; dismissHi(hiId: string): Promise<void>;
  requestGroup(suggestionIds: string[], size: GroupSize): Promise<GroupRequest>; getGroupRequest(id: string): Promise<GroupRequest>;
  listInvites(): Promise<Invite[]>; decideInvite(inviteId: string, decision: 'accept' | 'decline'): Promise<Invite>;
  listConnections(): Promise<Connection[]>; getPerson(userId: string): Promise<PublicProfile>;
  listThreads(): Promise<Thread[]>; getThread(threadId: string): Promise<Thread>;
  listMessages(threadId: string, after?: string): Promise<Message[]>;
  sendMessage(threadId: string, text: string, clientId: string): Promise<Message>;
  markThreadRead(threadId: string): Promise<void>;
  planMeetup(threadId: string, body?: { size?: GroupSize; note?: string }): Promise<Meetup>;
  listMeetups(): Promise<Meetup[]>; getMeetup(meetupId: string): Promise<Meetup>;
  voteMeetup(meetupId: string, votes: { optionId: string; vote: 'yes' | 'no' }[]): Promise<Meetup>;
  setMeetupStatus(meetupId: string, status: 'on_my_way' | 'arrived'): Promise<Meetup>;
  checkIn(meetupId: string, location: LatLng): Promise<CheckinResult>;
  sendFeedback(meetupId: string, feedback: Feedback): Promise<void>;
  getMap(): Promise<MapView>; updateLocation(location: LatLng): Promise<void>;
  setLocationShare(userId: string, maxPrecision: 'off' | 'neighborhood' | 'exact'): Promise<LocationShareState>;
  setLocationView(userId: string, precision: 'neighborhood' | 'exact'): Promise<LocationShareState>;
  setGhostMode(enabled: boolean): Promise<void>;
  report(body: ReportRequest): Promise<{ reportId: string }>; block(userId: string): Promise<void>;
};
```

- Everything goes through one private `request(operationId, method, path, body?, timeoutMs = 10_000)`.
- When `MOCK`, it calls `mockRequest(getUser(), ...)`. Otherwise it calls `fetch` with `X-CG-User`, an `AbortController` timeout, and error-envelope parsing into `CgError` (unknown code falls back to the HTTP status).
- The timeout is 30 s for `sendOnboardingMessage` and `planMeetup`.
- The result passes through `decoders[operationId]`.
- List endpoints unwrap `.items`.
- No WebSocket.

**`store.ts`** (module-level, `useSyncExternalStore`)

```ts
export interface CgState {
  ready: boolean; config: Config | null; me: Me | null; drop: Drop | null;
  hi: HiItem[]; invites: Invite[]; connections: Connection[]; threads: Thread[];
  messages: Record<string, Message[]>; meetups: Record<string, Meetup>;
  map: MapView | null; density: Density | null;
  error: { message: string; retry?: () => void } | null;
  celebrate: Connection | null;
  // own prefs: the only persisted fields (scoped storage 'common-ground:v1')
  userOverride: string | null; homeCardDismissed: boolean; lastMode: Mode | null; drafts: Record<string, string>;
}
export function getState(): CgState;
export function setState(patch: Partial<CgState>): void; // notifies; persists the 4 pref fields when they change
export function useCg<T>(select: (s: CgState) => T): T; // selector must return a stored reference or primitive, never a new array/object
export function start(): Promise<void>; // idempotent; hydrate prefs -> setUser -> load config + me -> refreshAll() if optedIn -> ready
export const load: {
  config(): Promise<void>; me(): Promise<void>; drop(): Promise<void>; hi(): Promise<void>; invites(): Promise<void>;
  connections(): Promise<void>; threads(): Promise<void>; meetups(): Promise<void>; map(): Promise<void>; density(): Promise<void>;
  messages(threadId: string): Promise<void>; meetup(meetupId: string): Promise<void>;
}; // each: api -> setState; failure sets state.error with retry, never throws
export function refreshAll(): Promise<void>; // drop, hi, invites, connections, threads, meetups, map
export function act<T>(fn: () => Promise<T>): Promise<T | undefined>; // run a mutation; on error set state.error (retry only if retryable) and resolve undefined
export function decide(suggestionId: string, decision: 'connect' | 'pass'): Promise<void>; // patches card.state from DecisionResult; 'connected' -> celebrate = connection, reload connections/threads/map
export function sendMessage(threadId: string, text: string): Promise<void>; // optimistic with clientId ('pending:' prefix on messageId); reconcile by clientId; on failure remove it and restore drafts[threadId]
export function setIdentity(userId: string | null): Promise<void>; // clears in-memory data, persists override, restarts
export function reset(): Promise<void>; // remove scoped key, resetMock(), back to the initial state
export function currentLocation(): Promise<LatLng | null>; // config.demo.fakeLocation, else lazy require('expo-location') foreground permission + position, else null
export function sendLocation(): Promise<void>; // C2: no-op if called within limits.locationMinIntervalS of the last send
export function setStorage(adapter: StorageAdapter): void; // tests only; default is lazy require('../../platform/scopedStorage').createScopedStorage('common-ground:v1')
export function useBadge(): number; // open cards + hi + pending invites + unread threads; 0 when not opted in or on error
export function useInboxRows(): ExternalRow[]; // one per thread, href `/common-ground/chat/${threadId}`; useMemo; [] when not opted in
export function useEventRows(): ExternalRow[]; // one per confirmed meetup, href `/common-ground/meetup/${meetupId}`; useMemo
```

- `useBadge` and the row hooks call `start()` on first use. On web (`process.env.EXPO_OS === 'web'`) `start()` is a no-op.
- A single background `setInterval` at `limits.pollIntervalS` runs `threads`, `drop`, `hi`, `invites`, `meetups` while opted in, with at most one in flight.
- `ExternalRow.imageUri` is `null` for `asset:` URLs (the Shell renders initials).

**`ui.tsx`** (may import React Native; shared by all Phase 2 agents, who must not edit it)

```ts
export function PersonAvatar(p: { person: PersonCard; size?: number }): JSX.Element;
export const personName: (p: PersonCard) => string; // displayName ?? 'Someone nearby'
export function InterestChips(p: { interests: InterestRef[] }): JSX.Element;
export function InterestEditor(p: { interests: MyInterest[]; onToggle(id: string): void; onRemove(id: string): void }): JSX.Element;
export function GroupSizePicker(p: { value: GroupSize; min: number; max: number; onChange(v: GroupSize): void }): JSX.Element;
export function AvailabilityGrid(p: { value: AvailabilitySlot[]; onChange(v: AvailabilitySlot[]): void }): JSX.Element;
export function Banners(): JSX.Element | null;
export function NotFound(p: { title: string }): JSX.Element;
export function usePoll(fn: () => void, seconds?: number): void;
export const distanceWords: (band: string) => string;
export const when: (iso: string) => string;
export const fromNow: (iso: string) => string;
```

- **`PersonAvatar`:** expo-image with `cachePolicy="memory"`; `asset:x` resolves through `imageSource(x)` from `../../data/media`. Otherwise a circle on `c.input` with initials in `Label` 700. For private profiles, put an `expo-blur` `BlurView` over the initials. Same geometry as the clone `Avatar`.
- **`InterestChips`:** wrapped, non-interactive pills in the clone `Chips` pill style.
- **`InterestEditor`:** grouped by `interest.path[0]`. Each pill toggles shown/hidden and has an `x` to remove. Sensitive ones show a `lock-closed` icon and a `Muted` "Only you can see this."
- **`GroupSizePicker`:** two rows of minus/plus `IconButton`s.
- **`AvailabilityGrid`:** 7×3 pressable cells; selected cells use `#e7f3ff` / `#263951` with `c.blue` text.
- **`Banners`:** the error banner in the Shell style (`#fff2d2` / `#634100`) with Retry and Dismiss, plus "Demo · signed in as {first name}" with a "Back to Maya" button when `userOverride` is set.
- **`NotFound`:** `Empty` plus a secondary `Button` "Back to Map".
- **`usePoll`:** runs on focus and every N seconds while focused, using `useFocusEffect` from expo-router.
- **`distanceWords`:** `under_1km` → "Less than 1 km away", and so on; unknown → "Nearby".
- **`when` / `fromNow`:** "Sat, Nov 15 · 7:30 AM" and "in 5 hours".

**Other feature files**

- **`HomeCard.tsx`** — final, small; the visual reference is the request card in `src/features/friends/Screen.tsx`.
  - Returns null unless `ready && me && !me.optedIn && !homeCardDismissed`.
  - `Card` (padding 16, gap 8) with `Label` 17/700 "Find your people" and `Muted` "Muse can introduce you to people nearby who are into what you're into."
  - A row of `Button` "Get started" (`go('/common-ground?find=1')`) and a secondary `Button` "Not now" (`setState({ homeCardDismissed: true })`).
- **`HomeCard.web.tsx`** — `export default () => null`.
- **`feature.ts`** — `export const commonGroundFeature: FeatureDefinition`, exactly per the PRD-1 §5 table.
  - Tab: `{ id: 'common-ground', label: 'Map', href: '/common-ground', icon: 'map-outline', activeIcon: 'map', after: '/friends', useBadge }`.
  - Menu item with icon `people-circle-outline`.
  - `homeSections: [{ id: 'common-ground-home', Component }]`, where `Component` lazily requires `./HomeCard` at render via `createElement(require('./HomeCard').default)`.
  - `inboxSources` labelled "Common Ground"; `eventSources` labelled "Planned with Muse".
  - `resetHooks: [{ id: 'common-ground', run: reset }]`.
- **`index.ts`** — `export { default as MapScreen } from './Map';` and the same for `ChatScreen` (`./Chat`), `MeetupScreen` (`./Meetup`), `PersonScreen` (`./Person`), `SettingsScreen` (`./Settings`), `DemoScreen` (`./Demo`).
- **`index.web.tsx`** — exports the same six names, all bound to one `Placeholder` component: `<div className="narrow-page"><PageTitle title="Common Ground" back /><Empty title="Common Ground is available in the iPhone app" text="Open this demo in Expo Go on an iPhone to use the Map." icon="friends" /></div>`. Use `PageTitle` and `Empty` from `../../ui/Controls.web`, and check the valid `icon` names there. It imports nothing from the store.
- **Placeholder screens** `Map.tsx`, `Finder.tsx`, `People.tsx`, `FriendSheet.tsx`, `Chat.tsx`, `Meetup.tsx`, `Person.tsx`, `Settings.tsx`, `Demo.tsx` — each a default export rendering `<Page><Banners /><Card><Title>…</Title></Card></Page>`, so routes compile and Phase 2 agents overwrite whole files.

### Other paths

- **Route files** (final; Phase 2 never edits them), each a single line such as `export { MapScreen as default } from '@/features/common-ground';`:
  - `src/app/common-ground/index.tsx`
  - `src/app/common-ground/chat/[threadId].tsx`
  - `src/app/common-ground/meetup/[meetupId].tsx`
  - `src/app/common-ground/person/[userId].tsx`
  - `src/app/common-ground/settings.tsx`
  - `src/app/common-ground/demo.tsx`
- **`src/extensions/registry.ts`** — import `commonGroundFeature` and append it last (PRD-4 step 9).
- **Node tests in `tests/common-ground/`:**
  - `contract.test.ts`
    - Walk every `paths.*.*.responses.2xx...example` in `../contracts/openapi.json` through `decoders[operationId]`; assert no throw and that known fields are preserved.
    - Unknown fields, enum values and attachment kinds do not throw.
    - Every `mockRequest` response for the main GETs has the schema's required keys.
  - `store.test.ts`
    - Call `setStorage` with an in-memory adapter.
    - Connect goes to `connect_sent`, or to `connected` with `celebrate`; pass goes to `passed`.
    - Optimistic send reconciles by `clientId`, and a failure restores the draft.
    - `sendLocation` throttles and uses `fakeLocation`.
    - Hooks' underlying selectors give `0` and `[]` when not opted in.
  - `registration.test.ts` — exactly one each of tab, menu item, Home section, inbox source, event source and reset hook.

Done when `npm test`, `npm run test:native`, `npm run typecheck`, `npm run lint`, `npm run build:web` and `npm run build:ios` pass. In Expo Go the bar should show Home, Friends, Map, Marketplace, Notifications, Menu; Map shows the placeholder; Home shows the "Find your people" card.

---

## Phase 2 — Screens (five agents in parallel, disjoint files)

**Common preamble (prepend to every Phase 2 brief):**

Work in `/Users/ayush/Downloads/My Projects/Hackathons/Meta-Closer-AI-Hackathon-2026/facebook-clone`. You own only the files listed; overwrite the placeholders. Do not edit `types.ts`, `api.ts`, `mock.ts`, `store.ts`, `ui.tsx`, `feature.ts`, the `index*` files, any `src/app/**` route, or any clone file. If the foundation lacks something, work around it locally and report it.

- **Data.** Read with `useCg(s => s.x)`; selectors return stored references only. Mutate with `act(() => api.someOp(...))`, then `load.x()` or `setState`. Poll with `usePoll`. The app runs on the in-app mock; make no assumption of a backend.
- **Design language (hard requirement).** Copy the clone exactly.
  - Colors only from `useColors()`.
  - Use only primitives from `../../ui/native` (`Label`, `Muted`, `Title`, `Card`, `Page`, `Button`, `IconButton`, `Icon`, `Input`, `Chips`, `Divider`, `Sheet`, `Empty`, `go`, `reportError`, `useKeyboardOffset`) and `./ui`.
  - No new shared components, style systems or hardcoded hex values, except `#fff` on blue and the selected-pill pair `#e7f3ff` / `#263951`.
  - Follow the spacing (16 padding, 7–14 gaps, radius 8 cards, 22 pills, 7 buttons) and the type scale of your reference screen.
  - Never render your own header; the Shell does. Put `<Banners />` at the top of the screen.
  - Light and dark both work.
- **Copy and privacy.** Copy follows `AGENT_RULES.md` R12: people, Connect / Pass / Say hi, Today's people, Muse in first person, no percentages, no emoji. Privacy follows R7 C5 and C6: never render another person's pass, decline or seen state; show interests exactly as sent.
- **Accessibility.** Every pressable has `accessibilityRole` and `accessibilityLabel`; targets are at least 44 pt.
- **Tolerant reader.** Use `?? ` defaults; unknown enum values render neutral text or nothing.
- **Minimalism.** Write the least code that works: no animation libraries, no gesture handlers, no extra files.
- **Jest tests** (`tests/common-ground/*.test.cjs`). Copy the mock preamble from `tests/native/screens.test.cjs` (`core/store` `useDemo` with `state.settings.theme`, `data/media`, `expo-router`, Ionicons, safe-area). Also `jest.mock` `expo-image`, `expo-blur`, `expo-haptics` and `react-native-maps` as plain host components, and `../../src/platform/scopedStorage` as an in-memory adapter. Use the real Common Ground store, which runs on the mock.
- **Finish** by running `npm run typecheck`, `npm run lint` and `npm run test:native`.

### Agent A — Map and friend sheet (PRD-1 §7.1)

- **Owns:** `src/features/common-ground/Map.tsx`, `src/features/common-ground/FriendSheet.tsx`, `tests/common-ground/map.test.cjs`.
- **Reference:** `Sheet` in `src/ui/native.tsx`; Messenger list rows and composer row in `src/features/messenger/Screen.tsx`; the Shell tab badge in `src/ui/Shell.tsx`; the Menu tile shadow in `src/features/menu/Screen.tsx`.

**`Map.tsx`** (default export)

- **Start-up.** Call `start()` on mount. Show `<Busy />` until `ready`.
- **Map.** Full-bleed `MapView` from `react-native-maps` (default Apple provider, `style={{ flex: 1 }}`). Initial region: `map.me.location`, else `config.demo.fakeLocation`, else the selected mode's `center`.
- **Polling.** `usePoll(() => { load.map(); sendLocation(); }, config.limits.mapRefreshS)`.
- **Friend pins.**
  - `Marker` per `map.friends` with a child `<PersonAvatar size={40} />` inside a 3 pt ring.
  - Ring colour: `c.online` for `arrived`, `c.blue` for `on_my_way`, otherwise `c.card`.
  - `accessibilityLabel` such as "Daniel, shares Coastal hikes".
  - `precision === 'neighborhood'` also draws a `Circle` of `radiusM` (fill `c.blue + '22'`, stroke `c.blue`).
- **Meetup pins.** A `Marker` with `Icon name="calendar"` in a 40 pt `c.card` circle; pressing it calls `go('/common-ground/meetup/' + meetupId)`.
- **Own position.** The clone's `Avatar` for Maya (`demo.person(demo.seed.viewerId).avatar`) at my location.
- **Density.** When `features.density` and (`!me.optedIn` or the finder is open): `load.density()` once, then a `Polygon` per bin with opacity scaled by `count / maxCount`. Add a pill chip at the top (`Card`, radius 22) reading "{totalLooking} people near you are looking". Draw nothing when there are no bins.
- **Bottom overlay** (absolute).
  - A "Find people" `Button` with icon `people` and the `useBadge()` count in the Shell badge style. It sits above the tray.
  - A horizontal `ScrollView` tray on a `c.card` strip: `PersonAvatar` 54, first name, and a `Muted` reason ("Not sharing location", "Haven't met yet", or nothing for unknown).
  - Tapping a tray item or a pin sets the selected user.
- **Recenter.** An `IconButton` (`locate`) in a 44 pt `c.card` circle with the Menu-tile shadow, top right, calling `animateToRegion`.
- **Finder.** `const { find } = useLocalSearchParams()`; open when `find === '1'` or when `ready && !me.optedIn`, on first render only. Render `<Finder onClose={() => router.setParams({ find: undefined })} />` from `./Finder` as an absolute-fill sibling over the map. The Find people button calls `router.setParams({ find: '1' })`.

**`FriendSheet.tsx`**

- `export default function FriendSheet({ userId, onClose }: { userId: string | null; onClose(): void })`.
- Uses the clone `<Sheet visible={!!userId} title={name} onClose={onClose}>`. Resolves the Connection from `connections` and the pin or tray item from `map`.
- Content is a `ScrollView` with padding 16 and gap 14:
  - `PersonAvatar` 72 and `InterestChips`.
  - The last 3 messages from `messages[threadId]` (call `load.messages`) as Messenger bubbles, plus a quick-reply `Input` and send `IconButton` wired to the store's `sendMessage`.
  - `Button` "Meet up": `act(() => api.planMeetup(threadId))`, then go to the chat.
  - Secondary `Button` "Open in Messenger" (the chat route).
  - `Label` 600 "Share my location" with `Chips` Off / Neighborhood / Exact (`api.setLocationShare`).
  - `Label` 600 "How I see them" with `Chips` Neighborhood / Exact (`api.setLocationView`; when `theyShare !== 'exact'`, omit Exact and add `Muted` "They share their neighborhood only").
  - Secondary `Button` "View profile", only when `canViewProfile`.
  - `Divider`, then secondary `Button`s "Report" (`Alert.alert` with reason choices, then `api.report`) and "Block" (destructive confirm, `api.block`, `refreshAll()`, close).
  - After each mutation call `load.connections()` and `load.map()`.

**Test and done**

- **Test:** the friend sheet renders the name, shared interests, the precision chips and Meet up for a mock connection, and hides View profile when `canViewProfile` is false.
- **Done:** in mock mode the map shows density and the "214 people…" chip before opt-in. After the mock flow it shows the tray, a meetup pin and Daniel's neighborhood pin; the sheet's actions all work.

### Agent B — Finder overlay (PRD-1 §7.2)

- **Owns:** `src/features/common-ground/Finder.tsx`, `src/features/common-ground/People.tsx`, `tests/common-ground/finder.test.cjs`.
- **Reference:** the request cards in `src/features/friends/Screen.tsx`; the display radio cards in `src/features/settings/Screen.tsx`; the Messenger bubbles and composer for the onboarding chat; `Sheet` for the Say hi composer.

**`Finder.tsx`**

- `export default function Finder({ onClose }: { onClose(): void })`.
- An absolute-fill `BlurView` (`expo-blur`, `intensity={60}`, `tint` from the theme: `demo.state.settings.theme`).
- Top row: `Title` "Find people" with an aside `IconButton` (`close`). There is no swipe gesture.
- Body: `<Banners />` then a `ScrollView` with padding 12 and gap 8. All content sits in `Card`s so text is readable over the map.
- The step is derived, not stored in a router:
  1. **Intro** (`!me.optedIn`).
     - A `Card` with a Muse row (`Icon` `sparkles` in `c.blue` inside a 40 pt `c.input` circle, plus `Label` 700 "Muse").
     - Two `Label` lines: "I'll introduce you to a few people nearby who are into what you're into." and "People only ever see what you have in common."
     - Mode radio cards from `config.modes`, in the Settings radio-card style. Unavailable modes are disabled with `Muted` "Coming soon". The default is `lastMode` or the first available.
     - `Button` "Continue": `act(() => api.optIn(mode, poolId))`, then `setState({ me, lastMode })`.
  2. **Onboarding chat** (`optedIn && me.interests.length === 0`, with a local session).
     - `api.startOnboarding()`, with the session in local `useState`.
     - Muse bubbles on the left (`c.input`) and mine on the right (`c.blue`).
     - While awaiting a reply, a `Muted` "Muse is typing…".
     - The Messenger composer row; a failed send keeps the text.
  3. **Review** (`session.status === 'review'`).
     - `InterestEditor` on `proposedInterests`, in local state.
     - `GroupSizePicker` bounded by `config.limits.groupSizeMin` and `groupSizeMax`.
     - `AvailabilityGrid`.
     - `Chips` Public / Private.
     - `Button` "Looks good": `api.completeOnboarding(...)`, `setState({ me })`, `refreshAll()`.
  4. **People** (otherwise): render `<People />`.

**`People.tsx`**

- Default export `People`, plus named export `DropCard({ card, selecting, selected, onSelect })` for the test.
- **Celebration.** When `celebrate` is set: `Haptics.notificationAsync(Success)` once, then a `Card` with both avatars, `Label` 21/700 "You and {first name} both said yes", and `Button` "Say hello". Say hello clears `celebrate` and goes to the chat.
- **Waiting for you** (only when `hi.length || pending invites`). A `Card` with heading "Waiting for you" and Messenger-style rows:
  - Opener row: avatar, "{name} said hi", the text, `InterestChips`, `Button` "Reply" (opens the composer sheet; `api.replyHi`, then go to the chat) and secondary "Ignore" (`api.dismissHi`).
  - Invite row: `Button` "Accept" and secondary "Decline" (`api.decideInvite`). Removed rows simply disappear.
  - Hidden when `features.sayHi` or `features.groups` is false.
- **Today's people.** Heading `Label` 19/700 "Today's people", with a secondary `Button` "Plan a group" toggle when `features.groups`. Show `drop.cards` filtered to `open` or `connect_sent`, at most `limits.dropMax`.
- **`DropCard`.** A `Card` with padding 16 and gap 8:
  - `PersonAvatar` 54, `personName` in `Label` 17/700, and `Muted` `distanceWords`.
  - `InterestChips` of the first `limits.sharedCoarseMax` interests.
  - `Label` reason.
  - A row of `Button` "Connect", secondary "Pass" and secondary "Say hi" (if `hiAvailable && features.sayHi`), wired to `decide()`.
  - `connect_sent` replaces the buttons with `Muted` "Connect sent" and nothing else.
  - `passed`, `expired` and unknown states are not rendered (C5).
  - In selecting mode the buttons become a checkbox row.
- **Group mode.** `GroupSizePicker` and `Button` "Ask Muse to invite them" (disabled under 2 selected): `api.requestGroup(ids, size)`, then `Muted` "Muse is inviting them. I'll let you know."
- **Say hi.** `Sheet` titled "Say hi", a multiline `Input` with `maxLength={limits.openerMaxChars}`, a counter and `Button` "Send". On `rejected`, keep the text and show `Muted` "Muse couldn't send that one. Try something friendly about what you share."
- **Empty.** `Empty`-style `Card`: "That's everyone for today. New people arrive {fromNow(drop.nextDropAt)}."

**Test and done**

- **Tests:**
  - A public `DropCard` shows the name, at most 3 chips and Connect / Pass / Say hi.
  - A private card shows "Someone nearby" and no name.
  - `connect_sent` shows "Connect sent" and no buttons.
  - `passed` and `expired` render null.
- **Done:** intro, three chat turns, review with one locked hidden interest, five cards; Connect on Daniel gives the celebration and the chat; Connect on others gives "Connect sent"; Pass removes the card; openers, invites and group requests work on the mock.

### Agent C — Chat (PRD-1 §7.3)

- **Owns:** `src/features/common-ground/Chat.tsx`.
- **Reference:** `src/features/messenger/Screen.tsx`, detail branch. Copy its structure and numbers one for one:
  - `KeyboardAvoidingView` with `keyboardVerticalOffset={useKeyboardOffset()}` and background `c.card`.
  - Header row: padding 12, gap 10, bottom border `c.divider`.
  - Bubbles: `maxWidth: '85%'`, radius 20, padding 14/10, own `c.blue` with white text, others `c.input`; `Muted` 10 pt time.
  - Composer row: padding 10, gap 6, top border, `Input` multiline with placeholder "Aa" and `maxHeight: 120`, send `IconButton` in `c.blue` when there is text.
  - `ScrollView` auto-scrolls to the end.

**Behaviour**

- `threadId` from `useLocalSearchParams`. The thread comes from `useCg(s => s.threads)`; if missing after load, render `<NotFound title="Conversation not found" />`.
- `usePoll(() => { load.messages(threadId); load.threads(); }, limits.pollIntervalS)`. On focus, `api.markThreadRead(threadId)` then `load.threads()`.
- **Header row.** Participant `PersonAvatar`s (overlapping for group threads), the title, and `Muted` shared-interests text. A direct thread with `canViewProfile` navigates to `/common-ground/person/{id}`.
- **Muse messages** (`sender.kind === 'muse'`). A full-width `Card`-style block with a `c.input` background and radius 8: a Muse avatar row (sparkles icon in a circle plus `Label` 700 "Muse"), then the text.
- **System messages.** Centered `Muted`.
- **Attachments.**
  - `starters` render as pill buttons (the `Chips` pill style, wrapped) that fill the composer.
  - `meetup` renders an inline `Card` with border `c.divider`: calendar icon, the meetup title or "Muse found options", `Muted` status and a secondary `Button` "View plan" going to `/common-ground/meetup/{id}`.
  - Unknown kinds are skipped.
- **Composer.** The text is `drafts[threadId]` via `setState`, with `maxLength={limits.messageMaxChars}`. Send calls the store's `sendMessage`. Pending messages (`messageId` starting `pending:`) render at 0.6 opacity.
- **Plan something.** A secondary `Button` (icon `calendar-outline`) above the composer when the thread has no `activeMeetupId`: `act(() => api.planMeetup(threadId))`, `load.threads()`. While that meetup is `proposing` (call `load.meetup` inside the poll), show `Muted` "Muse is finding options…".

**Done:** the Daniel thread shows the Muse intro and three starter chips; tapping one fills the composer; a send appears instantly and a reply arrives within about one poll; Plan something leads to "Muse is finding options…" and then an inline meetup card that opens the meetup.

### Agent D — Meetup (PRD-1 §7.4)

- **Owns:** `src/features/common-ground/Meetup.tsx`, `tests/common-ground/meetup.test.cjs`.
- **Reference:** `src/features/secondary/Screen.tsx`, events branch. `Page` then `Card`; a 200 pt hero; date `Label` in `c.badge` 13/700; title 21/27/700; `Muted` location; `Label` body; secondary `Button`s; inner padding 16, gap 7.

**Behaviour**

- `meetupId` from params; `usePoll(() => load.meetup(meetupId), limits.pollIntervalS)`; the meetup from `useCg(s => s.meetups[meetupId])`. If missing after the first load, `<NotFound title="Plan not found" />`.
- Attendee names come from the thread's `participants` (`threads.find(t => t.threadId === meetup.threadId)`), with "You" for me.
- **`proposing`:** a `Card` with `ActivityIndicator` and `Muted` "Muse is finding options…".
- **`voting`:** heading `Label` 19/700 "Muse found {n} options", then one `VotingCard` per option (named export `VotingCard({ option, onVote })`).
  - A `Card` with padding 16: `Label` 17/700 activity; `Label` in `c.badge` 13/700 `when(startsAt)`; `Muted` venue name and neighborhood; `Label` reason.
  - A row of two `Button`s, "Yes" and "No", with the chosen one primary and the other secondary (`accessibilityState.selected`).
  - `Muted` "{yes} yes · {no} no" for counts only, never who voted what.
  - Each tap calls `act(() => api.voteMeetup(id, [{ optionId, vote }]))`, then `setState` with the returned meetup.
- **`confirmed`:** a hero `MapView` (200 pt, `scrollEnabled={false}`, `pointerEvents="none"`, one `Marker` at `venue.location`), then a `Card` with `when(startsAt)` in `c.badge`, the title, `Muted` venue, and `Muted` `eventLabel`.
  - Attendee rows: `PersonAvatar`, name, and `Muted` RSVP / "On my way" / "Arrived" / "Checked in".
  - Within `limits.meetupStatusBeforeMin` before the start, until the end: `Button` "On my way" and secondary "Arrived" (`api.setMeetupStatus`).
  - While `checkinWindow` is open and `features.checkin`: `Button` "Check in". It calls `currentLocation()` then `api.checkIn`. If not accepted, show a `Muted` line for the reason ("You're not close enough yet." / "Check-in isn't open yet." / a generic line). Then `load.meetup` and `load.map`.
  - Secondary `Button` "Open chat".
- **`completed` with `feedbackDue`:** a `Card` per other attendee with "Did {name} show up?" and "Would you meet again?" (Yes/No `Button` pairs), then one multiline `Input` "Anything we should know?" and a secondary `Button` "Report someone" (`Alert` choosing an attendee; adds to `reportUserIds`). `Button` "Send": `api.sendFeedback`, then `load.meetup`, `load.map`, `load.connections`.
- **`completed` without `feedbackDue`:** `Muted` "Thanks. See your new friends on the map." and a `Button` back to the map.
- **`cancelled` or unknown:** a neutral `Empty`.

**Test and done**

- **Test:** `VotingCard` shows the activity, venue, reason and counts, and pressing Yes calls `onVote('yes')`. A confirmed meetup from the mock renders the title, `eventLabel` and Check in.
- **Done:** the mock flow runs from voting, through a Yes vote, to confirmed with map hero and `eventLabel`, then On my way, Check in, the three questions and Send; the Events screen then lists it under "Planned with Muse".

### Agent E — Settings, Person, Demo (PRD-1 §7.5, §3, §6)

- **Owns:** `src/features/common-ground/Settings.tsx`, `src/features/common-ground/Person.tsx`, `src/features/common-ground/Demo.tsx`.
- **Reference:** `src/features/settings/Screen.tsx`, exactly:
  - `Page`, then `Card style={{ borderRadius: 0 }}`, then `Title`.
  - Section headers: `Label` 19/700 plus `Muted`, padding 16.
  - Rows: minHeight 74, horizontal padding 16, gap 14, `Icon` size 25, chevron.
  - Radio cards; `Switch` with `trackColor`; `Divider`; `Alert.alert` destructive confirm.
- **Person reference:** the header area of `src/features/profile/Screen.tsx`, simplified.

**`Settings.tsx`** — one scrolling page, no sub-routes.

- When not opted in: `Empty` plus `Button` "Get started" (`go('/common-ground?find=1')`).
- **Mode:** radio cards from `config.modes`; unavailable ones show "Coming soon"; selecting calls `api.optIn(mode, poolId)` and `setState({ me, lastMode })`.
- **Profile:** `Chips` Public / Private (`api.updateMe`).
- **Your interests:** `InterestEditor` on `me.interests` (`api.setInterestVisibility`, `api.removeInterest`, then `load.me()`).
- **Group size:** `GroupSizePicker`, capped at `Math.min(limits.groupSizeMax, me.capabilities.maxGroupSize)`.
- **Availability:** `AvailabilityGrid` (`api.updateMe`).
- **Ghost mode:** a `Switch` row with `Muted` "Hide me from everyone's map" (`api.setGhostMode`, `load.me()`, `load.map()`).
- **Location sharing:** one Messenger-style row per connection with `PersonAvatar` 40, the name and `Chips` Off / Neighborhood / Exact (`api.setLocationShare`, `load.connections()`). Hidden when `features.locationSharing` is false.
- **Leave:** `Divider`, then secondary `Button` "Leave Common Ground" with an `Alert.alert` destructive confirm: `api.optOut()`, `refreshAll()`, `load.me()`, `router.replace('/common-ground')`.
- No unlock badges; the flag is false.
- Report in STATUS notes that nothing links to this screen: add a "Settings" link only if Agent A's Map has room, otherwise the integrator adds one `IconButton` (`settings-outline`) beside recenter in Phase 3.

**`Person.tsx`**

- `userId` param; `api.getPerson` in a local effect with local state. On any error (403 or 404), `<NotFound title="Profile not available" />`.
- `Page` then `Card` with padding 16: `PersonAvatar` 96, name 25/800, `Muted` neighborhood, `Label` bio, heading "You both like" with `InterestChips`, `Muted` "{n} meetups together" when present, and a `Button` "Message" to the thread from the matching Connection.

**`Demo.tsx`**

- If `!config?.demo.enabled`: `<NotFound title="This page isn't available" />`.
- Otherwise read `?as=`; if present, `setIdentity(as)` then `router.replace('/common-ground')`.
- With no param, a `Card` with `Label` "Signed in as {me.displayName}" and a secondary `Button` "Back to Maya" (`setIdentity(null)`).

**Done:** every control mutates the mock and survives navigating away and back; Leave returns the map to the density / intro state; `/common-ground/demo?as=u_0042` shows the banner "Demo · signed in as Daniel" on Common Ground screens and Back to Maya clears it; Settings › Reset demo (the clone) clears Common Ground state through the reset hook.

---

## Phase 3 — Integration and verification (one agent or the lead)

1. **Wire-up.**
   - Confirm `Map.tsx` imports `./Finder` and `./FriendSheet` with the agreed props.
   - Add the Settings entry point if missing (one `IconButton`).
   - Write `src/features/common-ground/STATUS.md`, about 20 lines: done, the minimal-scope decisions above, known gaps.
2. **Format:** `npm run format`.
3. **Checks**, run from `/Users/ayush/Downloads/My Projects/Hackathons/Meta-Closer-AI-Hackathon-2026/facebook-clone`:
   - `npm test`
   - `npm run test:native`
   - `npm run typecheck`
   - `npm run lint`
   - `npx expo install --check`
   - `npm run build:web`
   - `npm run build:ios`
   - `npm run test:e2e` (optional but in PRD-4's list; the web Menu gained an item)
4. **Static greps**, all expected to return nothing:
   - `grep -rn "internal/" src/features/common-ground` (C3).
   - `grep -rnE "#[0-9a-fA-F]{6}" src/features/common-ground --include=*.tsx | grep -vE "#fff|#e7f3ff|#263951|#fff2d2|#634100|#000"` (token discipline).
   - `grep -rn "WebSocket\|AsyncStorage\|localStorage" src/features/common-ground`.
   - `grep -rnE "match(es)?\b|swipe|candidate" src/features/common-ground --include=*.tsx` (R12 copy).
5. **Web:** `npm run web`. Menu › Common Ground shows the placeholder, the network tab shows no Common Ground requests, and Home has no card.
6. **Expo Go smoke** (`npm start`, iPhone, no env vars, so mock mode), in light and dark:
   - Six tabs fit, and the Map badge shows.
   - Home card "Get started" opens the finder over the map with density and "214 people near you are looking".
   - Intro, Muse chat (three turns), review with one locked interest, Today's people with a public and a private card.
   - Connect on Daniel gives a haptic and the celebration; Say hello opens the chat with the Muse intro and starters.
   - Plan something, vote Yes, confirmed; the venue pin shows on the map; Events shows "Planned with Muse"; the Messenger list shows the "Common Ground" section.
   - On my way, Check in, the three questions; then Daniel's pin on the map and the friend sheet with the precision chips.
   - Settings › Reset demo returns everything to first launch.

## Sequencing and risks

- Phases run 0 → 1 → 2 (A–E in parallel) → 3. Phase 2 files are disjoint, and the only cross-agent contract is `Finder({ onClose })` and `FriendSheet({ userId, onClose })`, both fixed above.
- **Jest and Expo modules.** Jest may fail to transform `expo-image`, `expo-blur`, `expo-haptics` or `react-native-maps`. Always `jest.mock` them; do not touch `transformIgnorePatterns`.
- **Selector loops.** `useSyncExternalStore` loops forever if a selector returns a fresh array or object. Derive with `useMemo` in components.
- **Blur readability.** Text directly on a `BlurView` over a map is hard to read. All finder content sits in `Card`s.
- **Typed routes.** `typedRoutes` is on; navigate with `go()` (which casts) or cast to `Href`.

### Critical Files for Implementation

- /Users/ayush/Downloads/My Projects/Hackathons/Meta-Closer-AI-Hackathon-2026/facebook-clone/src/ui/native.tsx
- /Users/ayush/Downloads/My Projects/Hackathons/Meta-Closer-AI-Hackathon-2026/facebook-clone/src/ui/Shell.tsx
- /Users/ayush/Downloads/My Projects/Hackathons/Meta-Closer-AI-Hackathon-2026/facebook-clone/src/extensions/registry.ts (and `types.ts` beside it)
- /Users/ayush/Downloads/My Projects/Hackathons/Meta-Closer-AI-Hackathon-2026/facebook-clone/src/features/messenger/Screen.tsx (visual reference; also `secondary/Screen.tsx` and `settings/Screen.tsx`)
- /Users/ayush/Downloads/My Projects/Hackathons/Meta-Closer-AI-Hackathon-2026/contracts/openapi.json (with `docs/common-ground/PRD-1-ios-common-ground.md` and `contracts/CONTRACTS.md`)