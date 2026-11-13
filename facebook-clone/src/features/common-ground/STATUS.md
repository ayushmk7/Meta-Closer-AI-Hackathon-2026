# ios status

Milestone: v2 M2 device layer (A2, `cg/ios/v2-m2-device`)

## Done

- 2026-11-12 A1 (`cg/ios/v2-m0-core`): v2 types and tolerant decoders for every JSON operation, api client for all 42 REST operations (30 s timeout for askMuse/createPlan/connectConnector), mock serving every operation from `fixtures.json`, contract test rewritten for v2, store actions frozen, STUB screens for slices B and C, all routes, v1 map-era code deleted.
- 2026-11-12 A1 review fixes: Retry reruns the store action (none for decideApproval, C8); a successful load clears the error; failed start stays not-ready; a generation counter drops stale responses after reset/setIdentity. Array selectors are cached (useCg-safe).
- 2026-11-12 A2: staged mock, `realtime.ts`, `calendar.ts`, `notifications.ts`.
- 2026-11-12 batch4 motion (`cg/ios/batch4-motion`): `ui.tsx` exports `enter(i)`, `PressScale`, `Skeleton`, `Pop`, `MuseThinking` (all reduce-motion aware; only Skeleton loops); Pill uses PressScale. Jest tests mock reanimated via `tests/common-ground/reanimated.cjs`.
- 2026-11-12 batch4 plans (`cg/ios/batch4-plans`): Muse bar shows `MuseThinking` + two PlanCard skeletons while asking/creating; reply and plan cards stagger in (native only: Reanimated web pins `enter()`'s custom keyframes to `position:absolute`); PlanCard presses with PressScale; "You're in." pops after I'm in; Connectors drop demo labels.
- 2026-11-12 batch4 meetup (`cg/ios/batch4-meetup`): done step checks and Like pop; steps and new chat messages enter with `enter()` (not initial history); Muse typing bubble while a toMuse send is pending; demo labels removed from approvals and booking details (C8 amount + payee kept); "Coming soon" call-venues teaser under the booking row.
- 2026-11-12 batch4 header (`cg/ios/b4-tab-header`): Plans tab registers `headerAction` (gear -> settings); native drops the in-screen "Plans" + gear row since the shell top bar now shows both, so the Muse bar sits under the top bar. Web keeps the row (web shell draws no tab title).
- 2026-11-13 Batch 5 Story prompt: after a completed meetup I went to, `StoryPrompt` (above Share to Explore) offers "Add to your story" with the venue photo and plan title only; one tap posts via shell `usePostStory` (`@/extensions/story`, CONTRACTS v2.1.3). Not now / posted is remembered per meetup in own prefs (`storyPrompt`). Test: `tests/common-ground/story.test.cjs`.

## Decisions
- 2026-11-13 Meetup writes carry a per-meetup request stamp; a fetch that left before a newer write (step event, later fetch, approval decision, leave) is dropped. Why: out-of-order responses dropped Muse steps (rule 10) and flipped decided approvals back to pending.
- 2026-11-13 MuseBar.send has a ref guard on top of `busy`. Why: `busy` lags a render, so Enter plus a send tap in one frame asked Muse twice, or in invite mode created two meetups.

- 2026-11-13 Batch 2 core (B1): shares and verify in types/api/mock/store; stub props frozen: `ShareCard({share})`, `ShareMeetup({m})`, `VerifyButton({m})`, `FeedbackExtras({value, onChange})` (rating/tags go into `sendFeedback`); `planLikeThis(share)` likes, then `createPlan` if `canCreatePlans` else `askMuse`. Mock verify accepts any code but my own (`MAYA42`), since each phone runs its own mock. Mock meetup completes after its end time. Reset demo clears `common-ground-quests:v1`.

- 2026-11-12 `fixtures.json` is a verbatim copy of every 2xx `example` in `contracts/openapi.json` (Metro cannot bundle outside the app). `contract.test.ts` fails if it drifts; regenerate with `CG_WRITE_FIXTURES=1 npm test`.
- 2026-11-12 Mock world starts not opted in and before setup. Staging (timestamps checked per request, step delay = max of `config.demo.stepDelayS`, 2 s when absent): I'm in on `pl_0001` forms `mt_0001` after 2 steps; steps tick; payment waits as `needs_you`; approve -> book, calendar, reminder tick -> `confirmed`, booked, Facebook Event label, calendar `event`; decline -> pay at the studio; a `toMuse` message -> reschedule steps `st_0008/9`, start +1 h, Muse reply in chat; the seeded `pl_0002` join turns `not_filled` (alternative `pl_0003`) after 30 s. `getMeetup`/`getThread` by ID always work.
- 2026-11-12 Realtime: WS per CONTRACTS §6 with 1/2/4/8/15 s backoff and refresh after reconnect; with the socket down, polls approvals, threads and `setting_up` meetups at `pollIntervalS` (1 s on the mock) and feed, joins, nudges at `feedRefreshS`.
- 2026-11-12 Calendar: `connectDeviceCalendar()` is what the "Calendar on this iPhone" toggle calls (permission -> `connectConnector` -> create "Common Ground" calendar). Uses `expo-calendar/legacy`: the package default is Calendar@next, which Expo Go stubs. Reconciles `syncCalendar` directives plus `Join.calendar`/`Meetup.calendar`, skips unchanged ones by signature, reports `applied` in an immediate second sync. Busy blocks are merged and carry start/end only.
- 2026-11-12 Leave-by: scheduled for confirmed meetups I'm going to when `museSettings.leaveByReminders`; moved on reschedule, cancelled on leave/cancel. Tapping opens `/common-ground/meetup/<id>?directions=1` (slice C: focus Directions on that param). Permission asked on first schedule.
- 2026-11-12 Frozen store API (slices B, C): `load.{config,me,setup,connectors,signals,feed,plan(id),joins,meetups,meetup(id),approvals,nudges,connections,person(id),threads,messages(threadId)}`, `refreshAll`, `optIn`, `connect`, `disconnect`, `askMuse`, `clearMuse`, `join(planId,{size,plusOne})`, `withdraw`, `createPlan`, `dismissNudge(id, mute)`, `mergeStep`, `decideApproval`, `leaveMeetup`, `sendMessage(threadId, text, {toMuse})`, `currentLocation` (C2), `setIdentity`, `reset`; selectors `nudgesFor(s, surface)`, `pendingApprovals`, `badgeCount`.
- 2026-11-12 Stub props frozen: `PlanCard({plan, onPress?, badge?})`, `MuseBar({prefill?})`, `StepTimeline({meetupId, steps})`, `ApprovalSheet({approval})`, `VenueMap({venue, style?})`; screens are default exports.
- 2026-11-12 Web is always on the mock (`api.MOCK` true when `document` exists, D5).
- 2026-11-12 Badge = pending approvals + unread threads + plans-surface nudges. Home card: setup card when not opted in, else newest home nudge.
- 2026-11-12 Storage key `common-ground:v2`; persisted fields: userOverride, homeCardDismissed, lastMode, drafts, calendar (own calendar ID, directive key -> event ID map, pending `applied`), reminders (meetup -> notification ID). Reset deletes our calendar events and cancels reminders first.
- 2026-11-13 Story prompt shows only when `venue.photoUrl` is set: the client can't see venue sensitivity and producers keep sensitive venues photo-less (CONTRACTS Decisions "Stories after the event"). Share to story is secondary while the Feedback card is due (one primary). Persisted prefs now also include `storyPrompt` (meetupId -> posted|dismissed, C1).
- 2026-11-13 Opening a chat marks it read, then reloads threads (no longer in parallel). Why: a list answering after the read put the old unread count back, so the badge stuck while the socket was open.

## Needs

- needs: sim venue photos (`venues.jsonl` `photo`) for the after-meetup Story prompt on the live backend; today no seeded venue has one, so live meetups send `photoUrl: null` and the prompt stays hidden (the mock shows it).
- needs: shell PR #6 merged (A2 branch merges `origin/cg/shell/v2-m0` for `expo-calendar`/`expo-notifications`).
- needs: backend live API (Checkpoint A); the real `fetch` path is untested against a server.

## Known gaps

- Plan pop-up is a plain stack push; formSheet `_layout.tsx` comes in A2 if wanted.
- Calendar writes and leave-by notifications are untested on a device: need a human with an iPhone in Expo Go (calshow, notification tap).
- The WebSocket path is untested against a live backend.
- askMuse and sendMessage drop results that land after setIdentity/reset (gen check). Other actions (join, optIn, dismissNudge rollback, likeShare) do not yet; their windows are short.
- 2026-11-13 batch5 passport (`cg/ios/b5-passport`): Passport redesign per b5 spec: blue cover card with count + progress bar, tilted postmark stamps (activity/place Ionicons, neighborhood monogram), earned date line, per-section counts, staggered enter, "See plans" on empty. Share IconButton (native Title aside, earned >= 1) sends own earned count, up to 3 activities and neighborhoods and a welcome link via RN `Share`; never venue names, dates, people or locked stamps. Cut per spec order: seen-stamp persistence (pop stays on earned transition). Native only: no web share entry.
- 2026-11-13 Faux call (UI only): a "Reserved a table…" book step plays a CallCard once per meetup per session (ringing, 4-line Muse/venue transcript, "Reserved · table for N · time"); reduce motion shows the final state; old "Coming soon" call teaser removed.
