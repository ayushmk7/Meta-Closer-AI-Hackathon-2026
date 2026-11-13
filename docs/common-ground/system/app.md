# App (`facebook-clone`, Meetups feature)

Expo SDK 57 (`expo ~57.0.33`), TypeScript, Expo Router. The feature is called **Meetups** everywhere a user can see it (rebrand from "Plans": #144 shell, #146 app strings, #148 backend copy, #145 contracts, #147 sim, #150 fixtures). Code identifiers, file names, routes and API paths did not change: the folder is still `common-ground`, the home screen is still `Plans.tsx`, and the API still says `plans`, `planId` and `/v1/plans`.

Native iOS on a phone is the target. The demo runs in Expo Go on iPhones against the live backend; web always runs on an in-app mock (D5, below) and gets no motion. `app.json` locks portrait.

The feature plugs into the clone through the extension registry and touches no core file (CONTRACTS §11). Per-slice status log: [`facebook-clone/src/features/common-ground/STATUS.md`](../../../facebook-clone/src/features/common-ground/STATUS.md). Current demo state: `status.md` in this folder, which is being added separately.

## Registration (`feature.ts`)

| Hook | Value |
| --- | --- |
| Tab | label **Meetups**, `href: /common-ground`, icon `sparkles-outline` / `sparkles`, `after: '/friends'`, badge from `useBadge` |
| Tab `headerAction` | gear `settings-outline`, label "Meetups settings", opens `/common-ground/settings` |
| Tab `titles` (#197, #202) | the shell top bar names pushed routes: settings "Settings", person "Profile", passport "Your passport", scan "Verify in person", explore "Explore", demo "Demo" |
| Menu item | "Meetups", "Meet up with people who are into what you're into" |
| Home section | `HomeCard` (lazy `require` so the registry graph stays free of React Native) |
| Inbox source | "Meetups" (group threads) |
| Event source | "Planned with Muse" (joins and meetups as Events rows) |
| Reset hook | `store.reset` |

Tab badge (`store.badgeCount`): pending approvals + threads with unread messages + nudges for the `plans` surface, and 0 when the user is not opted in.

## Screen map

All routes live in `src/app/common-ground/` and each is a one-line re-export from `src/features/common-ground/index.tsx` (native) or `index.web.tsx` (web).

| Route | Screen file | What it shows |
| --- | --- | --- |
| `/common-ground/welcome` | `Welcome.tsx` | Logged-out page |
| `/common-ground` | `Plans.tsx` (shows `Setup.tsx` until set up) | Meetups home |
| `/common-ground/setup` | `Setup.tsx` | 4-step setup, also "Edit setup" from Settings |
| `/common-ground/plan/[planId]` | `Plan.tsx` | Plan pop-up: detail, join, gathering, group set |
| `/common-ground/meetup/[meetupId]` | `Meetup.tsx` (+ `StepTimeline`, `ApprovalSheet`) | Muse setting it up, confirmed, day of, after |
| `/common-ground/chat/[threadId]` | `Chat.tsx` | Group chat |
| `/common-ground/scan/[meetupId]` | `Scan.tsx` / `Scan.web.tsx` | Verify in person (QR or typed code) |
| `/common-ground/person/[userId]` | `Person.tsx` | Public profile of someone you met |
| `/common-ground/explore` | `Explore.tsx` | Anonymous gallery of shared meetups |
| `/common-ground/passport` | `Passport.tsx` | Stamps |
| `/common-ground/settings` | `Settings.tsx` | Muse permissions, connected apps, privacy, prefs |
| `/common-ground/shared/[planId]` | `PublicPlan.tsx` | Logged-out public view of a shared meetup |
| `/common-ground/demo` | `Demo.tsx` | Demo identity switch (`?as=<userId>`), only when `config.demo.enabled` |

### Logged-out Welcome (`Welcome.tsx`)

The page after facebook.com logs out, drawn in a full-screen `Modal` so the shell's header and tabs are covered without a shell change. `Shell.tsx` also skips the tab chrome on this path, so no authenticated badge hooks run. On a phone it shows a wordmark bar with Log in, then the pitch ("Tell Muse what you want to do. It finds the meetup and the people and handles the rest. You just show up."), the privacy promise ("People only see what you have in common, and only after a group forms."), a read-only gallery "What people did this week" from anonymous `listShares`, and sticky "Log in" / "Create new account" buttons. Both buttons `router.replace('/common-ground')`. A `?share=<shareId>` query pins that share to the top. Nothing in the app navigates here: it is reached through a gallery share link, a Passport share link, a public plan's "See meetups" button, or a typed URL. `Welcome.tsx` still has a two-column desktop layout for widths of 900 pt and up; desktop is no longer a target ([decisions](decisions.md)).

### Setup (`Setup.tsx`, `Connectors.tsx`, pieces from `Settings.tsx`)

Shown in place of the home screen until `me.optedIn && me.setupComplete`. It shows "Step n of 4" (or "of 3" when `features.connectors` is off) above the steps. Each step remounts its ScrollView, so it opens at the top (#142), and slides in with `enter()` (#189).

1. **How it works** (page 0): a Muse bubble, then the mode picker from `config.modes` (unavailable modes are listed as "Coming soon: …"), then Continue, which calls `optIn`.
2. **Connect your apps** (page 1): `Connectors` rows (Calendar on this iPhone, Google Calendar, Google Maps, Strava, Eventbrite, Luma, Beli). The whole row toggles and the Switch is the accessible control. A `coming_soon` provider is disabled. The device calendar row asks iOS permission and creates the app's own calendar (`calendar.connectDeviceCalendar`). "Skip for now" moves on.
3. **What Muse picked up** (page 2): Muse's setup review text, "Your interests" (editor with show/hide), "What Muse noticed" (signals).
4. **Preferences** (page 3): Your profile, Group size, How far you'll travel, When you're usually free (availability grid), then "Find meetups" (`completeSetup`), which replaces the route with `/common-ground`.

Calendar sync (`calendar.ts`): with the device calendar connected, `syncCalendar` reads busy blocks from the phone (except the app's own calendar), merges them, and posts them to `POST /v1/calendar/sync` with `applied` results. It then reconciles the returned directives into events on the app's own calendar. It runs at most once per `config.limits.calendarSyncMinIntervalS`, over `calendarHorizonDays`, on app foreground and on the `calendar.changed` event, for at most two rounds per sync. Directives on joins and meetups (`Join.calendar`, `Meetup.calendar`) are reconciled whenever the store's joins or meetups change. Reset deletes the app's events. `expo-calendar/legacy` is used because Expo Go stubs the default export. Live Google Calendar free/busy is a backend feature; the app only sees the connector's `simulated: false` ([decisions](decisions.md), [backend.md](backend.md)).

### Meetups home (`Plans.tsx`)

Top to bottom:

- **Muse bar** (`MuseBar.tsx`): input "What do you want to do?", send button "Send to Muse". It sends `askMuse` (and waits at least 900 ms so the thinking lines can read). In invite mode ("Meet up with <name>…", from "Meet up again" on a connection) it sends `createPlan` with `inviteUserIds` and opens the new plan. While busy it shows `MuseThinking` lines ("Muse is reading what you asked…", "Muse is checking who's free…", "Muse is picking meetups…"; when creating, "Muse is finding a place…" and so on). Then it shows Muse's reply with the matching cards and follow-up prompt chips. The chip row's first chip is **Surprise me**. A `useRef` guard stops a double send when Enter and the send tap land in one frame (#155). Errors keep the typed text.
- **Nudge card** (`NudgeCard`): the newest `plans`-surface nudge, with "See meetup", "Not now", and "Not interested in this place" (mutes the signal). In `pool_sf_city` this is Maya's frequent place, **Little Fern Kitchen** (Hayes Valley), a pay-at-venue table for 4 at 7 PM (CONTRACTS Decisions "Nudge venue", #117, #120, #127). The same nudge feeds the Home tab card (`HomeCard.tsx`, `home` surface), which before setup shows "Get started" instead.
- **Your meetups**: one row per join and per meetup, newest first: "Muse is gathering people · 2 of 4" with a progress bar; "Muse is setting it up" with the current step label, a spinner and a "Needs you" badge when an approval waits; confirmed (date, venue, avatars, "Open group chat"); completed ("How was it?" while feedback is due); "This one didn't fill" with alternative cards.
- **For you**: `PlanCarousel` of `feed.plans`, every card the same size (#153, #176). It is hidden while a Muse reply is on screen.
- **Quests** (`Quests.tsx`), **Ideas row** (`IdeasRow.tsx`: one photo card per venue from shares, linking to Explore, #193), **Rewards** (`Rewards.tsx`) with a "Your passport" button, and **People you've met** (avatars; a public profile opens `Person`, otherwise a sheet with shared interests and "Meet up again").

On native the shell top bar shows "Meetups" and the gear; web draws its own title row.

**Surprise me** (`SurpriseButton.tsx`, "I'm feeling lucky"): a uniform random pick among open, not-full plans the viewer has not joined, taken from the viewer's own `getFeed`. The feed is already ranked and tailored to them, so the pick is too. It fires a light haptic and opens `/common-ground/plan/<id>?surprise=1`, where the plan shows "Muse picked this for you" and a "Try another" link that picks again without repeating. With nothing left it says "Nothing new right now. Try the Muse bar." This is client-only; there is no endpoint (CONTRACTS Decisions "Rewards").

### Plan pop-up (`Plan.tsx`): detail, join, gathering

Hero photo with "Share meetup" (when `features.sharing` is on and the plan is not an invite plan, #133), title, venue and neighborhood, duration and cost, then the sections Because, Who's in (counts only, C5), Muse will handle, Safety, and Other times. If the user is not opted in (for example a cold deep link after a reset), it shows `SetupPrompt` instead of the API's 403.

The bottom bar (`BottomBar`) follows the newest join row from the store, which polls fast while gathering. `plan.myJoin` only arrives with the slow feed refresh (#178), so it is the fallback.

| State | UI |
| --- | --- |
| open, not joined | **I'm in** (medium haptic), group size link ("4 people" or "3–5 people", opens a sheet), "+1 a friend" switch when `features.plusOne`, "Try another" on a Surprise pick |
| `interested` (gathering) | "You're in. Muse needs N more." / "You're in. Muse is forming your group." pops in (`Pop`) on a fresh tap, `Progress` bar, "Can't make it" (confirm alert, `withdrawJoin`) |
| `matched` | "Your group is set · N going" with up to 4 avatars that stagger in (`enter(i)`) plus a success haptic, but only if the user watched it form; "See meetup" |
| `not_filled` | "This one didn't fill", "See other meetups" |
| plan not open | "This meetup is <status>" |

### Meetup (`Meetup.tsx`): Muse steps, approvals, confirmed, day of

- **Header**: venue photo, title, date and time in `America/Los_Angeles`, and the address as the **Directions** link. Native shows an alert and then opens the server's `travel.directions` URL; web opens `directions.google` in a new tab, a human decision kept on purpose ([decisions](decisions.md)). C4: the URL is opened only on tap. "Open group chat".
- **Muse is setting this up** / **Muse set this up** (#174): `StepTimeline.tsx`. One row per `MuseStep`: an icon per kind (`find_time`, `choose_venue`, `book`, `payment`, `calendar`, …), a status mark (spinner while running, a check that pops via `PopOn` with a success haptic on a live flip to done, a blue dot for needs_you, a warning, or skipped), and the label. Unknown kinds and statuses render label and status. Steps arrive by `meetup.step` over WebSocket, or by polling, one per `demo.stepDelayS`. After confirmation the timeline collapses to one line ("Booked, paid and on your calendar"), unless a step needs the user. A step that needs the user and its approval card scroll into view (#199).
- **Faux call** (#151, pacing #196): when a step label starts with `Reserved a table` (the backend's restaurant copy, for example "Reserved a table for 4 at Little Fern Kitchen · 7 PM"), a `CallCard` plays above that row. It shows a pulsing `call-outline` and "Calling Little Fern Kitchen…" for 1.2 s, then four Messenger-style lines 0.9 s apart: the venue answers; Muse says "Hi, I'm Muse, an AI assistant. Could I book a table for 4 on Sunday at 7?"; the venue confirms; Muse says "Thank you!". It ends with "Muse called Little Fern Kitchen. Reserved · table for 4 · 7". While the call plays, the booking row reads "Reserving…" and spins, later steps stay queued, and then they tick in 400 ms apart. **This is UI only.** No call is placed, there is no telephony, and the backend and contracts know nothing about it; the script is built from the step label and the meetup. It plays once per meetup per app session (`store.calledMeetups`, an in-memory Set cleared by reset). Reduce motion shows the final state at once. It replaced the old "Coming soon" call teaser.
- **Approvals** (`ApprovalSheet.tsx`): an approval card inside the step that needs the user opens a bottom sheet with the amount ("No charge" when none). Approve stays disabled until the amount has rendered, and only a tap approves (C8). Decided states read "You approved this", "You said not now", "This request expired". `decideApproval`. Stale `getMeetup`/`listMeetups` answers are dropped, so a decided approval never flips back to pending and a step never disappears (#154).
- **Confirmed**: a success haptic on the `setting_up` → `confirmed` flip. Who's coming (names; "On my way" / "Arrived"), Details ("Open Calendar" on native, "Leave by <time>" from travel), day-of buttons "On my way" / "Arrived" (`setMeetupStatus`) and "Check in" (`checkIn` with location) inside the check-in window (or any time while confirmed with `config.demo.relaxCheckin`). Below that: "Meet up again next week" (`SameTimeNextWeek` in `Rewards.tsx`), then "Ask Muse to change it", which opens the chat with the draft "Muse, " (the backend routes messages that start with "Muse," to Muse), and "Can't make it" (`leaveMeetup`).
- **Verify in person** (`VerifyButton.tsx` → `Scan.tsx`): NFC is impossible in Expo Go, so it is "show my code, scan theirs". Native draws the user's code as a QR (a pure JS `View` grid using `qrcode-generator`) and scans the other person's with `expo-camera` ("Open camera"). Typed entry of the same 6 characters covers a denied camera and the Simulator; `Scan.web.tsx` is text plus typed entry. `verifyAttendee`; one accepted scan verifies both people. Verified attendees are listed under the button. The mock accepts any code except your own.
- **After the meetup** (status `completed`):
  - **Feedback** "How did it go?": three questions, then optional stars and tag chips (`FeedbackExtras.tsx`), then "Send feedback". Afterwards it shows "Thanks. Feedback sent."
  - **Story** (`StoryPrompt.tsx`, #119): offers to add the meetup to the user's own Facebook story in one tap, through the shell's `usePostStory` (#116). Only the venue photo and plan title go into the story, never people. It is offered only when `venue.photoUrl` is set, because producers keep it null for sensitive venues. "Not now" is a local flag.
  - **Share** (`ShareMeetup.tsx`): caption plus venue photo to Explore (`shareMeetup`), anonymous by contract, then "See it in Explore".

### Group chat (`Chat.tsx`)

Messenger look with its own header (back, avatars, title, a link to the meetup). The thread header scrolls as the first item, and native has one bar (#188). The composer is one row (#183): an "Ask Muse" toggle (placeholder "To Muse" instead of "Aa") and "Send message". Muse messages use one speech-bubble style, with attachments: `muse_steps` cards and `starters` chips (tap to send). Unknown attachment kinds render nothing. Sends are optimistic and keyed by `clientId`, so the server echo does not remount the bubble. Opening a chat marks it read, and the unread badge clears even if `listThreads` answers last (#157).

- **Only Muse shows typing.** After a message to Muse, a typing bubble ("Muse is on it…", dots that pulse in sequence, solid under reduce motion) shows until the next Muse message (`museBusy`). People never show typing: CONTRACTS §6 has no typing event, and the `thread.typing` proposal (#205) was closed unmerged for the demo freeze.
- **Synthetic replies.** Seeded counterparts answer a person's message after `demo.syntheticDelayS` (2 to 5 s) with one of six fixed lines ("Sounds great, see you there!", "Can't wait!", …), picked by a hash of the message id (#160). They are templates on purpose, because real Muse refuses to speak as a person ([muse.md](muse.md)).
- Muse's answers to Ask Muse messages come from the backend's scripted runner. A change request ("can we do 11 instead?") is handled by the runner.

### Explore, Passport, Rewards, Quests (client-side, private)

All private to the user and derived on the client (CONTRACTS Decisions). There are no endpoints beyond `Me.rewards`, `listShares` and `likeShare`.

- **Explore** (`Explore.tsx`): "Meetups people nearby went to. No names or faces." Shares are drawn like Facebook posts (`ShareCard.tsx`, author line = venue), filterable by activity and neighborhood on the client, with likes.
- **Passport** (`Passport.tsx`, `stamps.ts`, #124, #201, #202): a blue cover card with count and progress, then tilted postmark stamps for each distinct activity, neighborhood and venue met at, plus an empty state "Nothing to collect yet" with "See meetups". The share button in the hero (native, `features.sharing`, at least one stamp earned) sends the earned count, up to 3 activities and neighborhoods, and a Welcome link. It never sends venue names, dates or people.
- **Rewards** (`Rewards.tsx`): `Me.rewards` (`confirmedMeetups`, `streakWeeks`, `nextUnlock` from `params.unlocks`).
- **Quests** (`Quests.tsx`, `questLog.ts`): today's goals ("Join a meetup", "Say hi in a group chat", "Try Surprise me", "Verify in person") and a day streak, using `America/Los_Angeles` days. Stored under `common-ground-quests:v1` and cleared by reset. Hidden in invite mode.

### Shared meetup, logged out (`PublicPlan.tsx`)

The page a share link opens (`Linking.createURL('/common-ground/shared/<planId>')`; Expo Go `exp://…/--/…`, web the page origin). It uses the same logged-out frame as Welcome and makes anonymous calls only: `getPublicPlan` without `X-CG-User` (#129, #132), plus Welcome's gallery. It shows the hero photo (top-level `photoUrl`, #184), counts only and no people, then "Log in to join", "See more meetups" and "Share". The plan is kept in component state only (C1). Invite, cancelled and sensitive-venue plans 404 and show "This meetup isn't available".

### Settings, Person, Demo

- **Settings** (`Settings.tsx`): What Muse can do without asking (reschedule, fill spots, hold calendar time, spend limit), Where Muse looks, Connected apps, What Muse knows (interests and signals with show/hide/delete), Profile, Group size, How far you'll travel, Notifications ("Remind me when to leave"), and Meetups ("Edit setup", "Turn off Meetups" = `optOut`).
- **Person** (`Person.tsx`): reachable only when the connection has `canViewProfile`. It shows shared interests and "Meet up again".
- **Demo** (`Demo.tsx`): `/common-ground/demo?as=u_xxx` switches identity (`setIdentity`) and returns home. Without `as` it shows "Signed in as …" and "Back to Maya". Muse asks and chat sends still in flight never land in the next identity (#159).

## Data layer

| File | Role |
| --- | --- |
| `types.ts` | v2 types and tolerant decoders (unknown enum values and fields survive, CONTRACTS §3) |
| `api.ts` | one method per `openapi.yaml` operationId, except the WebSocket; `CgError` |
| `store.ts` | module-level store (`useCg` on `useSyncExternalStore`, `load.*`, `refreshAll`, actions `optIn`, `join`, `withdraw`, `askMuse`, `createPlan`, `decideApproval`, `sendMessage`, `verifyAttendee`, `shareMeetup`, `setIdentity`, `reset`…). It persists only own prefs under scoped storage `common-ground:v2` (C1). A generation counter, bumped by reset and by an identity switch, drops responses from before the switch. Identical poll results keep the old references, so screens do not re-render (#165). |
| `realtime.ts` | WebSocket `/v1/ws?user=` while in the foreground and opted in; events are hints and REST is the truth. It handles `feed.updated`, `join.updated`, `meetup.updated`, `meetup.step`, `approval.requested`, `nudge.created`, `message.created`, `thread.updated`, `connection.created`, `calendar.changed`, `signals.updated`, `me.updated`. With the socket down (always, on the mock) it polls at `config.pollIntervalS` / `feedRefreshS`. An opt-in made outside the app is picked up (#185). |
| `notifications.ts` | local leave-by notifications only, no push token; permission is asked the first time one is needed |
| `share.ts` | share and Welcome links via `Linking.createURL` |
| `mock.ts` + `fixtures.json` | in-app fake server (D5). The fixtures are a verbatim copy of every 2xx `example` in `contracts/openapi.json`; regenerate them with `CG_WRITE_FIXTURES=1 npm test` (`tests/common-ground/contract.test.ts`). The mock stages timed transitions with timestamps checked per request, never `setTimeout`. |

### API client (`api.ts`)

- Base URL `EXPO_PUBLIC_CG_API_URL`; header `X-CG-User: <user>` on every call except the anonymous ones (`getPublicPlan`, and logged-out `listShares`).
- **Timeout: 10 s by default** (`request(..., timeoutMs = 10_000)`), and `LONG` = 30 s (CONTRACTS §3 rule 9) for `askMuse`, `createPlan` and `connectConnector`. The timer aborts the fetch.
- Errors: a server error body becomes `CgError(status, code, message, retryable)` with known codes (`not_opted_in`, `rate_limited`, `muse_unavailable`, …), or a code mapped from the status. An aborted request becomes **"That took too long. Try again."** (code `timeout`). Any other network failure becomes "Couldn't reach Common Ground. Check your connection." (code `unavailable`). `Banners` in `ui.tsx` shows these at the top of each screen.
- **"That took too long. Try again." on every screen almost always means the phone cannot reach the laptop**: a stale LAN IP in `facebook-clone/.env` (`ipconfig getifaddr en0` changed after a network switch), the phone and laptop on different networks, or the backend down. `EXPO_PUBLIC_*` values are inlined into the bundle at build time (literal `process.env.EXPO_PUBLIC_*` reads), so after editing `.env` restart Metro with a cleared cache (`npx expo start --clear`). Reloading the app is not enough. See [runbook.md](runbook.md).

### Env (`facebook-clone/.env`, gitignored; template lines at the bottom of the root `.env.example`)

| Var | Meaning |
| --- | --- |
| `EXPO_PUBLIC_CG_API_URL` | `http://<laptop LAN IP>:8000`. Unset means the mock. |
| `EXPO_PUBLIC_CG_USER` | default identity when none is set in the app; the fallback is `u_maya` |
| `EXPO_PUBLIC_CG_MOCK` | `1` forces the mock |

**Web is always the mock (D5).** `api.MOCK` is true when `EXPO_PUBLIC_CG_MOCK=1`, when no API URL is set, or whenever `document` exists, which is any web build. `index.web.tsx` reuses the native screens inside the clone's narrow column and adds a back row with the screen title. `Scan.web.tsx` has no camera. Web has no device calendar, notifications or `enter()` motion. Web exists for tests and reviews; the demo is native ([decisions](decisions.md)).

## Motion and look (`ui.tsx`)

Motion helpers. Layout animations honour iOS Reduce Motion by themselves; the hand-driven ones check `useReducedMotion()`. Only `Skeleton` loops.

| Helper | What it does |
| --- | --- |
| `enter(i)` | `FadeInDown` 220 ms, rising 12 pt, stagger 60 ms for each index up to 4. Native only: Reanimated web pins keyframe views to `position:absolute`. |
| `PressScale` | the pressable dips to 0.97 while held (cards, pills) |
| `Skeleton` | pulsing placeholder; static under reduce motion |
| `Pop` | springs from 0.6 to 1 once on mount; change `key` to replay |
| `PopOn` | pops its child, plus one success haptic, when `on` changes after mount |
| `MuseThinking` | Muse's checklist while it works: lines show at 0, 1.2 and 3 s, then every 1.8 s; earlier lines tick, and the last spins until done |

Haptics (`expo-haptics`): light on Surprise me, medium on I'm in, success when a group forms, a meetup confirms or a step finishes live. Motion for joining, the group being set, steps, the call and chat came in #186; setup and log-in motion in #189.

Look: the feature uses the shell's tokens (`src/ui/tokens.ts`, `src/ui/native.tsx`: `c.blue`, `c.brand`, `c.card`, `c.divider`, light and dark themes) and shell `Button`, `Card`, `Section`, `Chips` (#166, #200). It also uses 44 pt tap targets (#168, #176), one card geometry (#176), one header anatomy and a one-row footer (#180), the map following the app theme (#180), and visible off tracks on switches (#200, #201). The UX audit scored the native app **uniformity 9.0, UX 9.0**, up from 7.0 and 6.9, with stated limits: [ux-audit.md](ux-audit.md). The end-to-end flow and its motion review are in [e2e.md](e2e.md).

## App fixes since batch 5 (#149 to #202)

| PR | Fix |
| --- | --- |
| #154 | Drop stale meetup fetches, so steps and decided approvals never revert (`tests/common-ground/race.test.ts`) |
| #155 | Muse bar sends once when Enter and the send tap land in one frame (in invite mode this had created two meetups) |
| #157 | Opening a chat clears its unread badge even if the thread list answers last |
| #159 | Muse asks and chat sends in flight never land in the next identity |
| #165 | Identical poll results no longer re-render screens |
| #178 | Plan page follows `join.updated`; "Group size · 4" when min = max |
| #185 | Realtime picks up an opt-in made outside the app |
| #193 | Setup step 1 fits the screen; a missing chat says so once; Ideas shows one card per venue |
| #196 | Call pacing: later steps held, "Reserving…" while calling, no jump at confirm |
| #199 | Approval step and its card scroll into view |
| #153, #166, #168, #174, #176, #177, #180, #183, #184, #188, #200, #201, #202 | UX uniformity pass (see [ux-audit.md](ux-audit.md)) |

The adversarial findings with measurements are in [perf-and-bugs.md](perf-and-bugs.md).

## Run and test

```sh
cd facebook-clone && npm ci
npm start                 # Expo dev server; scan the QR in Expo Go on an iPhone (same Wi-Fi)
npx expo start --clear    # after any .env change (EXPO_PUBLIC_* are baked into the bundle)
npm run ios               # iOS Simulator (needs full Xcode)
npm run web               # website, always on the mock
npm run typecheck         # tsc --noEmit
npm run lint              # eslint src tests
npm test                  # tsx --test "tests/**/*.test.ts" (includes tests/common-ground/*.test.ts and the contract test)
npm run test:native       # jest, tests/**/*.test.cjs (React Native screens: tests/common-ground, tests/native)
npm run test:e2e          # Playwright on web (tests/browser)
CG_WRITE_FIXTURES=1 npm test   # regenerate fixtures.json from contracts/openapi.json
```

Phone setup: put `EXPO_PUBLIC_CG_API_URL=http://<LAN IP>:8000`, `EXPO_PUBLIC_CG_USER=u_maya` and `EXPO_PUBLIC_CG_MOCK=0` in `facebook-clone/.env`, restart Metro with `--clear`, and keep the laptop and phone on one network. If the venue Wi-Fi blocks device-to-device traffic, use a hotspot (`HUMAN_TODO.md`). For the iOS Simulator on the same laptop, `http://127.0.0.1:8000` should work; the UX audit ran the Simulator against the live backend ([ux-audit.md](ux-audit.md)), but the exact URL it used is not recorded. The whole-demo steps are in [runbook.md](runbook.md).
