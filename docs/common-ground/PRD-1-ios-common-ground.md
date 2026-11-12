# PRD 1: Common Ground in the iOS app (v2)

**Agent:** ios · **Branch prefix:** `cg/ios/` · **Status file:** `facebook-clone/src/features/common-ground/STATUS.md`
**Writes only:** `facebook-clone/src/features/common-ground/**`, `facebook-clone/src/app/common-ground/**`, `facebook-clone/assets/common-ground/**`, `facebook-clone/tests/common-ground/**`

Read first: [CONTRACTS](../../contracts/CONTRACTS.md), [AGENT_RULES](AGENT_RULES.md), `contracts/openapi.yaml`, `facebook-clone/docs/ARCHITECTURE.md` and `EXTENDING.md`. [DESIGN](DESIGN.md) explains the product and why v2 changed.

## 1. Goal

Build Common Ground as one feature module of the Facebook clone: a **Plans** tab where the user tells Muse what they want to do, browses suggested plans, taps **I'm in**, and then watches Muse set the plan up. Muse's work must be visible: checks on every card, "Muse will handle" on every plan, a live step timeline on every meetup, and approvals before money moves. Everything users see comes from the public API; the app adds no ranking, matching or privacy logic of its own.

The demo runs on an iPhone in Expo Go. The judged moments you own:

1. **Proactive entry.** Facebook Home shows Muse's nudge card ("You've walked Lands End 4 times this month…"). Tapping it opens the plan.
2. **Setup.** Connected apps with what each reads; what Muse picked up, with one sensitive place hidden behind a lock.
3. **Muse bar.** "pottery this weekend" → Muse's answer and cards with ✓ Fits your Saturday · 22 min by transit · $35. Open the pop-up: who's in (coarse), Muse will handle, I'm in.
4. **Visible agent.** The group forms; the meetup screen shows Muse's steps ticking live; the approval sheet ("OK $35 · demo payment"); the event appears in the iPhone's Calendar app; the group chat opens with Muse's intro and starters.
5. **Changes and day of.** "Muse, can we do 11 instead?" in the chat → new steps tick; the leave-by notification opens Directions; check-in; the three questions; People you've met.

## 2. Constraints (fixed)

- Expo Go, SDK 57, iOS. Use only what is installed. The shell agent installs the CONTRACTS §11 allowlist (`expo-calendar`, `expo-notifications`, `react-native-maps`, `expo-location`, `expo-blur`, `expo-haptics`); the clone already has `expo-image`, `react-native-reanimated`, `react-native-gesture-handler`, `react-native-safe-area-context`. No new packages. Directions use React Native `Linking`.
- Register only through the extension points (CONTRACTS §11). Never edit clone files.
- Use the clone's tokens and primitives: `useColors()`, `Label`, `Muted`, `Button`, `IconButton`, `Card`, `Sheet`, `Input`, `go`. Light and dark both work. The v1 frontend plan's design-language section ([FRONTEND_PLAN §0](FRONTEND_PLAN.md)) still applies.
- Client duties C1 to C8 (AGENT_RULES R7). Avatars and venue photos load through `expo-image` with `cachePolicy="memory"`.
- Every number from `GET /v1/config`. Every surface behind its `features` flag.
- Web runs the same screens on the in-app mock only, with no network requests (D5). Calendar, notifications and directions are no-ops on web.

## 3. Migrating from the v1 build

The v1 map-era screens exist on `main` (see STATUS.md). Your first v2 PR:

- **Remove:** `Map.tsx`, `maps.tsx`, `maps.web.tsx` (keep a slimmed venue-preview component if you like), `Finder.tsx`, `FriendSheet.tsx`, `People.tsx`, the density layer, location sending, ghost mode, voting, drop, opener and invite code and their fixtures and tests.
- **Keep and adapt:** `api.ts` (the request core), `store.ts` (the module store pattern), `mock.ts` (rebuild the fixtures from v2 examples), `types.ts` (rewrite for v2), `Chat.tsx` (add Muse actions and the new attachments), `Meetup.tsx` (replace voting with the step timeline and approvals; keep status, check-in and feedback), `Settings.tsx`, `Person.tsx`, `Demo.tsx`, `HomeCard.tsx`, `feature.ts`, `index.tsx` and `index.web.tsx`.
- **Contract test:** `tests/common-ground/contract.test.ts` reads `contracts/openapi.json`, which is now v2. Rewrite its operation list (`getFeed`, `getPlan`, `listJoins`, `getMeetup`, `listApprovals`, `listConnectors`, `getSetup`, …) in the same PR. CI's app job stays red from the contracts v2 merge until this lands, so ship it first.

## 4. Configuration and identity

- `EXPO_PUBLIC_CG_API_URL` (the laptop's LAN address), `EXPO_PUBLIC_CG_USER` (default `u_maya`), `EXPO_PUBLIC_CG_MOCK=1` for in-app fixtures. Mock is the default when the URL is unset.
- In-app fixtures stage what Prism cannot: a plan forming after a delay, Muse steps advancing one by one, a pending approval resolving into booked, a reschedule after a `toMuse` message, a `not_filled` join with alternatives. Derive them from `contracts/openapi.json` examples; a test fails if they drift.
- **Second phone.** In demo mode (`config.demo.enabled`), `/common-ground/demo?as=u_0042` sets an identity override stored with `createScopedStorage('common-ground:v2')`. Every request then uses that `X-CG-User`, and a slim banner reads "Demo · signed in as Daniel" with a button to return to Maya. Open it with `exp://<LAN-IP>:8081/--/common-ground/demo?as=<liveUserId>` (the dashboard shows a QR code). Nothing else can switch identity.
- The clone's viewer `maya` is `u_maya`.

## 5. Data layer

You choose the design. It must satisfy:

- One typed API client for every operation in `openapi.yaml`, with timeouts (30 s for `askMuse`, `createPlan` and `connectConnector`, 10 s otherwise), the `X-CG-User` header, error envelope parsing, and the tolerant reader rules (CONTRACTS §3), including unknown `MuseStep.kind` (render label and status) and unknown attachment kinds (skip).
- Types hand-written in your folder to mirror the spec. A test parses every `openapi.json` 2xx example through your decoders.
- A module-level store (not a provider inside your route layout), because the shell calls `useBadge` and `useRows` from the tab bar, Home, Messenger and Events. Those hooks return `0`, `[]` or `null` when not opted in, offline or on error, and never fetch more than once per `limits.pollIntervalS`.
- **Realtime:** open `ws://…/v1/ws?user=<id>` while foreground and opted in; back off 1, 2, 4, 8, 15 s; refetch per CONTRACTS §6. `meetup.step` merges a step into the cached meetup by `stepId` (append if new) so the timeline animates without a refetch. With the socket down, poll the open meetup (while `setting_up`), open thread and approvals at `pollIntervalS`, and the feed, joins and nudges at `feedRefreshS`.
- Optimistic I'm in (show "You're in" at once; reconcile with the returned Join) and optimistic chat sends with `clientId`.
- In memory only for other people's data (C1). Scoped storage holds: identity override, dismissed Home card, last selected mode, unsent drafts, the calendar key-to-event-ID map, the device calendar ID, and scheduled notification IDs.

### 5.1 Calendar sync (C7)

- **Connect:** the "Calendar on this iPhone" toggle requests calendar permission (`expo-calendar`). On grant, call `connectConnector('device_calendar')`, create (once) a calendar named "Common Ground" and remember its ID.
- **Read:** on app foreground and on `calendar.changed`, at most once per `limits.calendarSyncMinIntervalS`, read events from now to `+limits.calendarHorizonDays` days across the user's calendars except "Common Ground", map each to `{start, end}` only, merge overlaps, and send `syncCalendar` with `applied` from the last reconcile.
- **Write:** reconcile every directive from the `syncCalendar` result, `Join.calendar` and `Meetup.calendar`: `hold` and `event` create or update the event (title, start, end, location, notes) in the Common Ground calendar; `none` deletes it. Record the outcome and report it in `applied` on the next sync, sent right away. Never write anywhere else.
- Without calendar permission, everything still works: the server uses fallback availability, and "Added to your calendar" shows as skipped.

### 5.2 Local notifications

- When a meetup is `confirmed` and `museSettings.leaveByReminders`, schedule a local notification at `travel.leaveBy`: "Leave by 9:28 for Hayes Clay Studio · {travel.label}". Tapping it opens the meetup with Directions focused. Reschedule or cancel it when the meetup changes. Request notification permission the first time one is needed, not at launch. Local only: never request a push token (CONTRACTS §11).

## 6. Registration (`src/features/common-ground/feature.ts`)

Export `commonGroundFeature: FeatureDefinition` with:

| Field | Value |
| --- | --- |
| `tabs` | `{ id: 'common-ground', label: 'Plans', href: '/common-ground', icon: 'sparkles-outline', activeIcon: 'sparkles', after: '/friends', useBadge }`; badge = pending approvals + unread threads + new nudges on the `plans` surface |
| `menuItems` | `{ id: 'common-ground', label: 'Common Ground', icon: 'sparkles-outline', href: '/common-ground', description: "Plans with people who are into what you're into" }` |
| `homeSections` | Native and web mock. Not opted in and not dismissed: a setup card ("Muse can find things to do with people who are into what you're into." Get started / Not now). Opted in: the newest `listNudges(surface=home)` nudge as a card with its title, text, a "Because" line, Open plan and Not now (`dismissNudge`; a second "Not interested in this place" sends `mute: signal`). Nothing otherwise. |
| `inboxSources` | `{ id: 'common-ground', label: 'Common Ground', useRows }`: one row per group thread (title, last message preview, unread), `href` to the chat route |
| `eventSources` | `{ id: 'common-ground', label: 'Planned with Muse', useRows }`: one row per confirmed meetup (`href` to the meetup), then one row per nudge on the `events` surface ("Going alone? 4 others are too", `href` to the plan) |
| `resetHooks` | Clear the scoped storage key and in-memory store, delete the Common Ground device calendar's events, and cancel scheduled notifications. The backend demo reset is not your job. |

## 7. Routes

| Route | Screen |
| --- | --- |
| `/common-ground` | Plans home (tab root). Not set up → the setup flow. |
| `/common-ground/plan/[planId]` | Expanded plan pop-up (`formSheet` or `pageSheet` modal presentation) |
| `/common-ground/meetup/[meetupId]` | Meetup: Muse's timeline, approvals, details, day-of, feedback |
| `/common-ground/chat/[threadId]` | Group chat, Messenger style |
| `/common-ground/person/[userId]` | Public profile (only when `canViewProfile`) |
| `/common-ground/settings` | Settings, connectors, what Muse knows |
| `/common-ground/setup` | Setup flow (also reachable from Settings to revisit connectors) |
| `/common-ground/demo` | Identity override (demo mode only; otherwise not found) |

Detail routes show the shell's back header titled "Plans". Unknown IDs show the clone's not-found pattern.

## 8. Screens

### 8.1 Plans home (tab root)

Top to bottom, in one scroll view:

1. **Muse bar.** A Muse avatar and an `Input` "What do you want to do?" (max `limits.museAskMaxChars`) with a send button. Below it, prompt chips (`Feed.prompts`, then `MuseReply.prompts` after an answer); tapping a chip sends it. Below that, `Feed.museStatus` as a live status line with a subtle activity indicator while any meetup is `setting_up`. Sending calls `askMuse` with the current `conversationId`, shows a typing state ("Muse is looking…"), then Muse's reply as a bubble under the bar and its `plans` as a highlighted row of cards. If `createdPlanId` is set, label that card "New · Muse made this plan". Clearing the bar returns to For you. Errors keep the text.
2. **Nudge** (when `listNudges(surface=plans)` has one): a card with title, text, Because line, Open plan, and a dismiss menu (Not now / Not interested in this place).
3. **For you.** A horizontal carousel (snap to card, about 280 pt wide) of `Feed.plans`. Each **plan card**: venue photo (or a tinted placeholder with the activity icon), title, venue name and neighborhood, day and time in local time ("Sat 10 AM"), duration and cost label, up to 3 checks as "✓ label" (a failed check shows a muted "label" with no tick), the crowd line ("3 in · 2 spots left"), Muse's `reason` in secondary text, and an "In" badge when `myJoin` is set. Tapping opens the plan pop-up.
4. **Your plans.** From `listJoins` plus `listMeetups`, newest first. Rows by state:
   - `interested`: "Muse is gathering people · 3 of 4" with progress, tap → plan pop-up.
   - `matched` with meetup `setting_up`: "Muse is setting it up" with the latest step label; a "Needs you" badge when an approval is pending; tap → meetup.
   - meetup `confirmed`: day, time, venue, attendee avatars, Open chat; tap → meetup.
   - `not_filled`: "This one didn't fill" plus the alternatives as small cards. Nothing about why.
   - meetup `completed` with `feedbackDue`: "How was it?" → meetup feedback.
5. **People you've met** (when `listConnections` is not empty): avatars (initials for private) with first names. Tap → person (public) or a small sheet with shared interests and **Plan something again** (`canPlanAgain`), which opens the Muse bar prefilled "Plan something with Daniel…" and sends `createPlan` with `inviteUserIds`.

A settings icon in the top-right of the section header opens Settings. Pull to refresh refetches feed, joins, meetups and nudges.

### 8.2 Plan pop-up (`/common-ground/plan/[planId]`)

`getPlan`. Hero photo, title, venue and address, day, time and duration, cost, a small static `MapView` of the venue (no user location, not interactive, a single marker), travel label, checks, Muse's reason, **Because** lines (owner-only signals, each with its source name, e.g. "Google Maps"), **Who's in** ("3 people in · 2 also do ceramics · 2 spots left", from `crowd`, never names), **Muse will handle** as a checklist with Muse's avatar, **Safety** lines, **Other times** (`alternatives` as chips → open that plan), and a Directions link.

Bottom bar:
- Not joined: **I'm in** (primary, full width). A small "Group size" control opens a sheet to set `size` within `limits` before joining (optional). With `features.plusOne`, a "+1 a friend" toggle.
- `interested`: "You're in · Muse is gathering people (3 of 4)" and **Can't make it** (`withdrawJoin`, confirm first).
- `matched`: **Open your plan** → meetup.
- `closed` or `full` and not joined: disabled with the server's status as plain text ("This plan is full").

On I'm in: haptic, optimistic state, then the returned Join. Apply `Join.calendar` (hold) per §5.1.

### 8.3 Meetup (`/common-ground/meetup/[meetupId]`)

Facebook Event style header: title, day and time, venue (static map), `eventLabel` when set, attendee avatars.

1. **Muse is setting this up** (always visible; collapsible once `confirmed`): the `museSteps` timeline in order. Each row: an icon for its kind, the `label`, optional `detail`, and a status mark: queued (hollow circle), running (spinner), done (filled check), needs you (accent dot plus "Needs you"), failed (warning mark, followed by Muse's next step), skipped (muted dash). New steps animate in; reduced motion turns the animation off. A `needs_you` step with an `approvalId` that is mine shows the approval inline.
2. **Approval sheet** (inline card that opens a `Sheet`): `title`, `detail`, amount and payee, "Demo payment · no real money moves" when `simulated`, `fallback` in secondary text, **Approve** and **Not now** (`decideApproval`). The Approve button is enabled only after the sheet has rendered the amount (C8). Haptic on approve.
3. **Who's coming:** each attendee with name (first name only for private), avatar or initials, shared interests at full depth, and On my way or Arrived when set. Tap a public person → person route.
4. **Details:** booking (`booking.label`, confirmation code, "Simulated booking"), cost and my payment state, calendar ("Added to your calendar" when the directive is applied, with an "Open Calendar" link via `Linking.openURL('calshow:…')`), travel label, leave-by time, and **Directions** (Apple Maps, or Google Maps from an action sheet). Share plan with a friend (system share sheet with title, time and venue only).
5. **Day of:** On my way and Arrived (`setMeetupStatus`) from `limits.meetupStatusBeforeMin` before start until the end; **Check in** while `checkinWindow` is open (one `expo-location` reading, or `demo.fakeLocation`; show the server's reason if not accepted).
6. **After:** when `feedbackDue`, the three questions per attendee (Did they show up? Would you meet again? Anything we should know?), the last opening Report. Send with `sendFeedback`.
7. **Actions:** Open group chat; Ask Muse to change something (opens the chat with the composer prefilled "Muse, "); Can't make it (`leaveMeetup`, confirm first).

### 8.4 Group chat (`/common-ground/chat/[threadId]`)

Messenger look with clone tokens. My bubbles blue, others gray. Muse messages are distinct: Muse avatar and label, full-width card style. Attachments: `starters` → chips that fill the composer; `meetup` → an inline meetup card; `muse_steps` → a compact progress card listing those steps' labels and statuses (tap → meetup); `approval` → an inline approval (mine only); `plan` → a plan card. An **Ask Muse** chip above the composer toggles `toMuse` for the next message (shown as "To Muse" in the composer); typing "Muse, …" also works server-side. While Muse is handling a `toMuse` message, show "Muse is on it…" until the next Muse message. Mark read on focus. The header shows participant avatars and opens the meetup.

### 8.5 Setup (`/common-ground/setup`)

A short paged flow; Back works on every page.

1. **Intro** (not opted in): Muse's two lines on how it works and the privacy promise ("People only see what you have in common, and only after a group forms."), the mode picker from `config.modes` (unavailable modes show "Coming soon"), Continue → `optIn`.
2. **Connect your apps** (`features.connectors`): `listConnectors` as rows with label, `reads`, a "Demo data" tag when `simulated`, and a toggle (`connectConnector`, `disconnectConnector`; the calendar row runs §5.1). `coming_soon` rows are disabled. "Skip for now" is always available.
3. **What Muse picked up:** `getSetup` (refetch after each connect). `museText`, then interests grouped by category as chips (show, hide, remove), each with its evidence on long-press or an info button. Sensitive ones arrive hidden with a lock and "Only you can see this". Then signals ("4 visits to Lands End Trail in October · Google Maps"), each hideable; sensitive signals show only as locked rows with their label.
4. **Preferences:** profile public or private, group size (min and max within `limits`), how far you'll travel (minutes and modes), and, only when no calendar is connected, a coarse availability grid. With `features.autonomySettings`, a "What Muse can do without asking" section (§8.6). Done → `completeSetup` → Plans home.

### 8.6 Settings (`/common-ground/settings`)

Mode switcher; Connected apps (as in setup); What Muse knows (signals with hide and delete, interests with show, hide and remove); profile visibility; group size; travel; Muse permissions (`features.autonomySettings` only: auto-spend limit with $0 / $10 / $25 / $50 choices, auto-reschedule, auto-backfill, calendar holds, leave-by reminders, saved with `updateMe`); Notifications; Leave Common Ground (`optOut`, confirm first).

### 8.7 Person (`/common-ground/person/[userId]`)

`getPerson`: name, photo, bio, neighborhood, shared interests, meetups together, **Plan something again** when `canPlanAgain`, and Report and Block in an overflow menu.

## 9. Quality

- VoiceOver labels on every card, chip, step and icon button (a step reads "Booked 3 wheels, done"); 44-point targets; Dynamic Type does not clip cards (the carousel grows taller); reduced motion turns off step and celebration animations.
- The carousel scrolls at 60 fps with 8 cards with photos on an iPhone 12 or newer.
- Errors: an inline banner with Retry; `retryable: false` shows the server's message. Losing the network keeps everything visible and readable.
- Copy follows AGENT_RULES R12. Server copy is shown as is.

## 10. Tests (`facebook-clone/tests/common-ground/`)

- Every `openapi.json` 2xx example parses through your decoders; unknown fields, enum values, step kinds and attachment kinds do not throw.
- Store: join optimism and reconciliation; `meetup.step` merge (append, update in place, never reorder); refetch rules per realtime event; polling fallback.
- Calendar reconciler: hold → event → none transitions against a fake calendar; only start and end leave the device (C7); writes only to the Common Ground calendar.
- C2: location is read only from the check-in action, and fake location is used when set. C5: no rendering path for others' withdrawals or not-filled reasons; Crowd never renders names. C8: the approval button stays disabled until the amount renders; nothing approves without a tap.
- Notifications: leave-by scheduled on confirm, moved on reschedule, cancelled on leave and cancel.
- Registration: exactly one tab, one menu item, one Home section, one inbox source, one event source and one reset hook; hooks return `0`, `[]` or `null` when not opted in.
- Component tests (Jest, `.test.cjs`): plan card (checks, crowd, joined badge), plan pop-up bottom bar states, step timeline (every status, unknown kind), approval sheet, Muse bar reply.

## 11. Done when

- With `make mock-api` and with in-app fixtures, every screen above works in Expo Go on an iPhone, and on web with the mock.
- Against the live backend with the seed loaded, the five demo moments in section 1 run end to end, on one phone with synthetic counterparts and on two phones with the live counterpart, including a real event in the iPhone Calendar app and a real leave-by notification.
- The clone's own checks still pass (D5).
- STATUS.md is current, including every decision another agent might care about.

## 12. Out of scope

Android, push notifications, background location or background sync, a share extension, any internal or dashboard view, any ranking, matching or privacy filtering on the client, real payments.
