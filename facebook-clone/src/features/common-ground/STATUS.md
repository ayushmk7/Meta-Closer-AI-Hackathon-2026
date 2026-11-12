# ios status
Milestone: v2 M0 (A1 core done; A2 device + staged mock next)

## Done
- 2026-11-12 A1 (`cg/ios/v2-m0-core`): v2 types and tolerant decoders for every JSON operation, api client for all 42 REST operations (30 s timeout for askMuse/createPlan/connectConnector), mock serving every operation from `fixtures.json`, contract test rewritten for v2, store actions frozen, STUB screens for slices B and C, all routes, v1 map-era code deleted.

## Decisions
- 2026-11-12 `fixtures.json` is a verbatim copy of every 2xx `example` in `contracts/openapi.json` (Metro cannot bundle outside the app). `contract.test.ts` fails if it drifts; regenerate with `CG_WRITE_FIXTURES=1 npm test`.
- 2026-11-12 Mock world starts not opted in and before setup. Joining `pl_0001` forms `mt_0001` at once (A2 stages the delay); `getMeetup`/`getThread` by ID always work so slice C can build without joining.
- 2026-11-12 Frozen store API (slices B, C): `load.{config,me,setup,connectors,signals,feed,plan(id),joins,meetups,meetup(id),approvals,nudges,connections,person(id),threads,messages(threadId)}`, `refreshAll`, `optIn`, `connect`, `disconnect`, `askMuse`, `clearMuse`, `join(planId,{size,plusOne})`, `withdraw`, `createPlan`, `dismissNudge(id, mute)`, `mergeStep`, `decideApproval`, `leaveMeetup`, `sendMessage(threadId, text, {toMuse})`, `currentLocation` (C2), `setIdentity`, `reset`; selectors `nudgesFor(s, surface)`, `pendingApprovals`, `badgeCount`.
- 2026-11-12 Stub props frozen: `PlanCard({plan, onPress?, badge?})`, `MuseBar({prefill?})`, `StepTimeline({meetupId, steps})`, `ApprovalSheet({approval})`, `VenueMap({venue, style?})`; screens are default exports.
- 2026-11-12 Web is always on the mock (`api.MOCK` true when `document` exists, D5).
- 2026-11-12 Badge = pending approvals + unread threads + plans-surface nudges. Home card: setup card when not opted in, else newest home nudge.
- 2026-11-12 Storage key `common-ground:v2`; persisted fields: userOverride, homeCardDismissed, lastMode, drafts (A2 adds calendar map and notification IDs).

## Needs
- needs: shell `expo-calendar`, `expo-notifications` installed (PRD-4 step 10) before A2 calendar/notifications land.
- needs: backend live API (Checkpoint A); the real `fetch` path is untested against a server.

## Known gaps
- Plan pop-up is a plain stack push; formSheet `_layout.tsx` comes in A2 if wanted.
- No staging in the mock yet (forming delay, ticking steps, reschedule, not_filled): A2.
- No WebSocket; global poll at `feedRefreshS` only: A2.
- e2e `phone touch gestures … story strip` fails on this base; clone-only, slice D carries the fix.
