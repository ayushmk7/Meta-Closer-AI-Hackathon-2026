# PRD 1: Common Ground in the iOS app

**Agent:** ios · **Branch prefix:** `cg/ios/` · **Status file:** `facebook-clone/src/features/common-ground/STATUS.md`
**Writes only:** `facebook-clone/src/features/common-ground/**`, `facebook-clone/src/app/common-ground/**`, `facebook-clone/assets/common-ground/**`, `facebook-clone/tests/common-ground/**`

Read first: [CONTRACTS](../../contracts/CONTRACTS.md), [AGENT_RULES](AGENT_RULES.md), `contracts/openapi.yaml`, `facebook-clone/docs/ARCHITECTURE.md` and `EXTENDING.md`. [DESIGN](DESIGN.md) explains the product.

## 1. Goal

Build Common Ground as one feature module of the Facebook clone: a Find My-style **Map** tab showing your Common Ground friends, with friend finding as a translucent overlay on top of the map. Everything users see comes from the public API; the app adds no matching logic and no privacy logic of its own.

The demo runs on an iPhone in Expo Go. The judged moments you own:

1. First launch: the finder opens over the map with an anonymous density layer and "214 people near you are looking."
2. Muse onboarding chat, then an interest review where one sensitive interest is already hidden.
3. Today's people: a public card and a private card that shows only shared interests. Multi-select two and pick a group size.
4. A mutual connect from the second phone (or the synthetic fallback): celebration, Muse's intro and three starters, three meetup options, votes, the event confirmed, a venue pin on the map.
5. Check-in and the three questions, then new friends on the map. Tap a photo: bottom sheet with shared interests, quick chat and the precision toggle.

## 2. Constraints (fixed)

- Expo Go, SDK 57, iOS. Use only what is installed. The shell agent pre-installs `react-native-maps`, `expo-location`, `expo-blur`, `expo-haptics`; the clone already has `expo-image`, `react-native-reanimated`, `react-native-gesture-handler`, `react-native-safe-area-context`. Apple Maps only (default provider). No new packages.
- Register only through the extension points (CONTRACTS §11). Never edit clone files. Your first PR merges after the shell agent's first PR, which adds those types.
- Use the clone's tokens and primitives: `useColors()`, `Label`, `Muted`, `Button`, `IconButton`, `Card`, `Sheet`, `Avatar`, `Input`, `go`. Light and dark both work.
- Client privacy duties C1 to C6 (AGENT_RULES R7). Avatars from the API load through `expo-image` with `cachePolicy="memory"` so other people's photos never reach disk.
- Every number from `GET /v1/config`. Every surface behind its `features` flag.
- Web: render a placeholder page ("Common Ground is available in the iPhone app") and make no network requests (D5).

## 3. Configuration and identity

- `EXPO_PUBLIC_CG_API_URL` (the laptop's LAN address) and `EXPO_PUBLIC_CG_USER` (default `u_maya`).
- Mock modes: `make mock-api` (Prism on :8000) needs no app change. For flows Prism cannot stage (a mutual connect, a meetup moving from voting to confirmed), `EXPO_PUBLIC_CG_MOCK=1` serves in-app fixtures. Keep them in your folder (Metro does not bundle files outside `facebook-clone/`), derived from the `contracts/openapi.json` examples; a test fails if a fixture stops matching the contract. Use mocks until Checkpoint A, then keep them working for offline development.
- **Second phone.** In demo mode (`config.demo.enabled`), the route `/common-ground/demo?as=u_0042` sets an identity override stored with `createScopedStorage('common-ground:v1')`. Every request then uses that `X-CG-User`, and a slim banner reads "Demo · signed in as Daniel" with a button to return to Maya. Open it on the second phone with the Expo Go deep link `exp://<LAN-IP>:8081/--/common-ground/demo?as=<liveUserId>` (a QR code works). Nothing else in the app can switch identity.
- The clone's viewer `maya` is `u_maya`. Your own avatar on the map is the clone's Maya avatar from `@/data/media`.

## 4. Data layer

You choose the design. It must satisfy:

- One typed API client for every operation in `openapi.yaml`, with request timeouts (30 s for onboarding turns and `planMeetup`, 10 s otherwise), the `X-CG-User` header, error envelope parsing, and the tolerant reader rules (CONTRACTS §3).
- Types hand-written in your folder to mirror the spec. A test loads `contracts/openapi.json` and parses every response example through your types and decoders.
- A module-level store (for example `useSyncExternalStore`), not a provider inside your route layout, because the shell calls your `useBadge` and `useRows` hooks from the tab bar, Messenger and Events, outside your routes. Those hooks return `0` or `[]` when not opted in, offline or on error, and never trigger more than one fetch per `limits.pollIntervalS`.
- Realtime: open `ws://…/v1/ws?user=<id>` while the app is foreground and opted in; back off 1, 2, 4, 8, 15 s; on any event refetch what CONTRACTS §6 lists. With the socket down, poll the open thread and meetup at `pollIntervalS` and the map at `mapRefreshS`.
- Optimistic sends with `clientId`; reconcile with the server's message. Never lose a draft on error.
- In memory only for other people's data (C1). Scoped storage holds just: identity override, dismissed Home card, last selected mode, unsent drafts.

## 5. Registration (`src/features/common-ground/feature.ts`)

Export `commonGroundFeature: FeatureDefinition` with:

| Field | Value |
| --- | --- |
| `tabs` | `{ id: 'common-ground', label: 'Map', href: '/common-ground', icon: 'map-outline', activeIcon: 'map', after: '/friends', useBadge }`; badge = open cards in today's drop + pending openers + pending invites + unread threads |
| `menuItems` | `{ id: 'common-ground', label: 'Common Ground', icon: 'people-circle-outline', href: '/common-ground', description: 'Meet people who share your interests' }` |
| `homeSections` | Native: a "Find your people" card shown only when not opted in and not dismissed. Copy: "Muse can introduce you to people nearby who are into what you're into." Actions: Get started (opens the finder), Not now (dismiss). Web: renders nothing. |
| `inboxSources` | `{ id: 'common-ground', label: 'Common Ground', useRows }`: one row per thread (title, last message preview, unread), `href` to the chat route |
| `eventSources` | `{ id: 'common-ground', label: 'Planned with Muse', useRows }`: one row per confirmed meetup, `href` to the meetup route |
| `resetHooks` | Clear the scoped storage key and the in-memory store. The backend demo reset is not your job. |

## 6. Routes

| Route | Screen |
| --- | --- |
| `/common-ground` | Map (tab root). `?find=1` opens the finder overlay. |
| `/common-ground/chat/[threadId]` | Chat, Messenger style |
| `/common-ground/meetup/[meetupId]` | Meetup, Facebook Event style |
| `/common-ground/person/[userId]` | Public profile (only when `canViewProfile`) |
| `/common-ground/settings` | Common Ground settings |
| `/common-ground/demo` | Identity override (demo mode only; otherwise not found) |

Detail routes show the shell's back header titled "Map". Unknown IDs show the clone's not-found pattern.

## 7. Screens

### 7.1 Map (default view)

- Full-bleed `MapView` under the shell header. Initial region: my location, else `config.demo.fakeLocation`, else the selected mode's `center`.
- **Friend pins** from `getMap().friends`: circular photo markers (initials when no photo). `precision: neighborhood` also draws a translucent circle of `radiusM`. A ring shows `meetupStatus` (on my way, arrived). VoiceOver label: "Daniel, about 1 km away, shares coastal hikes".
- **Meetup pins** at venues: a calendar marker; tap opens the meetup.
- **Tray** along the bottom: horizontally scrolling avatars for `tray` items with a short reason ("Not sharing location", "Haven't met yet"). Tap opens the friend sheet.
- **Find people** button: always visible above the tray, with the badge count. Opens the finder.
- **Friend sheet** (Find My style bottom sheet, your implementation): name, shared interests, last messages with a quick reply field, Meet up (calls `planMeetup`, then opens the chat), Open in Messenger (the chat route), my sharing level for this person (`setLocationShare`: Off, Neighborhood, Exact), how I view them (`setLocationView`; Exact disabled unless they share exact), View profile (public only), and Report and Block in an overflow menu.
- **Density layer**: when not opted in, or while the finder is open on first launch, draw `getDensity` bins as polygons with opacity by count, plus the "N people near you are looking" chip. Never draw anything for bins the server omits.
- Recenter button. Sends location per C2 while focused.

### 7.2 Finder overlay

A translucent `BlurView` layer over the live map (the map keeps rendering behind it), dismissed by swipe down or close. States, in order:

1. **Intro** (not opted in): two lines from Muse about how it works and the privacy promise ("People only ever see what you have in common"), the mode picker from `config.modes` (unavailable modes show "Coming soon"), Continue → `optIn`.
2. **Onboarding chat**: `startOnboarding`, then turns via `sendOnboardingMessage` with a typing indicator. When `status` becomes `review`, show the review step.
3. **Interest review**: proposed interests grouped by category. Each chip can be shown, hidden or removed. Sensitive ones arrive hidden and show a lock with "Only you can see this." Also group size (min and max within `limits`), availability grid, public or private profile. Confirm → `completeOnboarding`.
4. **Today's people**: up to `limits.dropMax` cards. Each card: photo or a blurred initials placeholder for private profiles, name or "Someone nearby", distance band in words, up to three shared-interest chips, Muse's reason, and Connect, Pass, Say hi. `connect_sent` shows a calm "Connect sent" with no hint about the other person. Passed cards disappear. A **Plan a group** toggle switches to multi-select: pick two or more, set the size range, `requestGroup`.
5. **Mutual connect**: haptic and a short celebration ("You and Daniel both said yes"), then Say hello opens the chat. The person joins the tray.
6. **Waiting for you**: openers (`listHi`, Reply or Ignore) and group invites (`listInvites`, Accept or Decline), above the cards when present.
7. **Empty**: "That's everyone for today. New people arrive {relative nextDropAt}."

Say hi is a small composer capped at `limits.openerMaxChars`. A `rejected` result explains gently ("Muse couldn't send that one. Try something friendly about what you share.") and keeps the text.

### 7.3 Chat

Messenger look with clone tokens. My bubbles blue, others gray. Muse messages are distinct: a Muse avatar and label, full-width card style. `starters` attachments render as chips that fill the composer. `meetup` attachments render an inline meetup card. A **Plan something** action calls `planMeetup` (optional size and note) and shows "Muse is finding options…" until `meetup.updated`. Mark read on focus. Group threads show participant avatars in the header row.

### 7.4 Meetup

Facebook Event style: title, date and time, venue with a small map, `eventLabel`, attendee avatars and RSVPs. During `voting`, every option shows activity, venue, time, Muse's reason and yes/no toggles (several yes allowed; send with `voteMeetup`), with vote counts. Once `confirmed`: On my way and Arrived (`setMeetupStatus`) from `limits.meetupStatusBeforeMin` before start until the end; Check in while `checkinWindow` is open (`checkIn` with the location from C2; show the server's reason if not accepted). When `feedbackDue`: the three questions per attendee (Did they show up? Would you meet again? Anything we should know?), the last opening Report. Send with `sendFeedback`.

### 7.5 Settings

Mode switcher, profile visibility, interests (show, hide, remove), group size, availability, ghost mode, per-person location sharing list, Leave Common Ground (`optOut`, confirm first).

### 7.6 Scene leaderboard and unlocks

Only when `features.leaderboard` or `features.unlocks` is true: a card in the finder ("Most active this week: bouldering, board games, run clubs") with Follow, and unlock badges in Settings.

## 8. Quality

- VoiceOver labels on every marker, chip and icon button; 44-point targets; Dynamic Type does not clip cards; reduced motion turns off the celebration animation.
- 60 fps map pan with 50 markers on an iPhone 12 or newer. Marker images sized to 40 points.
- Errors: inline banner with Retry; `retryable: false` shows the server's message. Network loss keeps everything visible and readable.
- Copy follows AGENT_RULES R12.

## 9. Tests (`facebook-clone/tests/common-ground/`)

- Every `openapi.json` example parses through your decoders; unknown fields, enum values and attachment kinds do not throw.
- Store: drop state transitions, optimistic send reconciliation, refetch rules per realtime event, polling fallback.
- C2: location throttling and fake-location substitution. C5: no rendering path for others' pass or decline states.
- Registration: the feature contributes exactly one tab, one menu item, one Home section, one inbox source, one event source and one reset hook; hooks return `0` and `[]` when not opted in.
- Component tests (Jest, `.test.cjs`) for the drop card (public and private), the friend sheet and the meetup voting card.

## 10. Done when

- With `make mock-api`, every screen above works in Expo Go on an iPhone.
- Against the live backend with seed loaded, the five demo moments in section 1 run end to end, on one phone with synthetic counterparts and on two phones with the live counterpart.
- The clone's own checks still pass (D5), and web makes no Common Ground requests.
- STATUS.md is current, including every decision another agent might care about.

## 11. Out of scope

Android, web feature parity, background location, push notifications, any internal or dashboard view, any matching, ranking or privacy filtering on the client.
