# End-to-end flow

The demo flow from logged out to a passport stamp, the script that walks it through the API, and what is still open. Sources: `scripts/e2e_flow.py`, `facebook-clone/src/features/common-ground/*.tsx`, `services/api/src/cg_api/agent/__init__.py`, `contracts/params.yaml`.

## The flow

| # | Beat | App (`facebook-clone/src/features/common-ground`) | API | What moves on screen |
| - | ---- | --- | --- | --- |
| 1 | Logged-out Welcome | `Welcome.tsx` (full-screen Modal, anonymous gallery) | `listShares` without `X-CG-User` | gallery cards rise in (`enter(i)`) |
| 2 | Setup: mode, connect apps, what Muse picked up, preferences | `Setup.tsx`, `Connectors.tsx` | `POST /v1/optin`, `POST /v1/connectors/{p}`, `GET`/`POST /v1/me/setup` | none between steps (hard cuts) |
| 3 | Calendar sync | `calendar.ts` | `POST /v1/calendar/sync` | none (background) |
| 4 | Meetups home: Muse bar, nudge, For you, Surprise me | `Plans.tsx`, `MuseBar.tsx`, `SurpriseButton.tsx` | `GET /v1/feed`, `GET /v1/nudges`, `POST /v1/muse/ask` | Muse thinking lines, skeleton cards, cards stagger in |
| 5 | I'm in | `Plan.tsx` `BottomBar` | `POST /v1/plans/{id}/join` | medium haptic, "You're in." pops |
| 6 | People join, group forms | `Plan.tsx`, `Plans.tsx` `YourPlanRow` | `join.updated` (WS) or `GET /v1/joins` | counts only until the group forms (C5) |
| 7 | Muse sets it up | `Meetup.tsx`, `StepTimeline.tsx` | `meetup.step` (WS) or `GET /v1/meetups/{id}`, one step per `demo.stepDelayS` (1 to 2 s) | step rows enter, running step spins, done check pops |
| 8 | Faux venue call | `StepTimeline.tsx` `CallCard` | none: UI only, keyed off a step label starting `Reserved a table` | ringing icon 1.2 s, four transcript lines at 0.9 s, reserved line |
| 9 | Approval | `ApprovalSheet.tsx` | `GET /v1/approvals`, `POST /v1/approvals/{id}/decision` | sheet slides in, success haptic on approve |
| 10 | Confirmed | `Meetup.tsx` | meetup `status: confirmed` | timeline collapses to one summary row |
| 11 | Group chat | `Chat.tsx` | `GET`/`POST /v1/threads/{id}/messages`, `message.created` | new messages rise in, Muse typing dots after an Ask Muse message |
| 12 | Verify in person | `VerifyButton.tsx`, `Scan.tsx` | `POST /v1/meetups/{id}/verify` | not reviewed |
| 13 | After the meetup: feedback, share, story, passport | `Meetup.tsx`, `ShareMeetup.tsx`, `StoryPrompt.tsx`, `Passport.tsx` | `POST .../feedback`, `POST .../share`, `GET /v1/me` | story card pops on post, new stamps pop once with a haptic |

Motion helpers and their reduce-motion behaviour are in [app.md](app.md). Stack transitions and the shell `Sheet` read the system setting (`facebook-clone/src/app/_layout.tsx`, `src/ui/native.tsx`).

## The script

`scripts/e2e_flow.py` (stdlib only) walks beats 2 to 13 through the public API as `u_maya` and asserts each one. It stops at the first failure and prints one line per step with its wall time.

```sh
python3 scripts/e2e_flow.py            # expects a fresh u_maya
python3 scripts/e2e_flow.py --reset    # POST /internal/v1/demo/reset first: resets EVERY user
CG_API_URL=http://127.0.0.1:8010 CG_INTERNAL_URL=http://127.0.0.1:9011 python3 scripts/e2e_flow.py --reset
```

- Needs a `DEMO_MODE=1` backend with `pool_sf_city` loaded ([runbook.md](runbook.md)). Defaults: `CG_API_URL=http://127.0.0.1:8000`, `CG_INTERNAL_URL=http://127.0.0.1:9001`.
- `--reset` wipes the whole world. On a backend other people are using, run it against a private one on other ports.
- Exit code 0 when all 12 steps pass. Waits: 90 s for the group and for confirmed, 45 s for a chat reply.
- It joins the plan behind the Little Fern Kitchen nudge, approves any pending approval for that meetup, takes another attendee's `verifyCode` to verify, and moves the meetup to `completed` with `POST /internal/v1/demo/meetups/{id}/advance`.
- It asserts the `Reserved a table` label prefix, because the app's faux call depends on that exact backend copy.

What it does not cover: anything on screen, the WebSocket (it polls), device calendar writes, notifications, the camera scan, and the logged-out Welcome page.

## Known gaps

Open on 2026-11-13. Evidence and smallest fixes: orchestrator findings `e2e-run`, `e2e-anim`, `e2e-fable`.

| Gap | Area |
| --- | ---- |
| With the WebSocket down, joins, the feed and an open plan pop-up refresh only every `limits.feedRefreshS` (60 s) (`realtime.ts` `pollSlow`, `Plan.tsx` `usePoll`), while the backend forms a group in a few seconds. A Simulator burst showed the pop-up unchanged for about 8 s across a join and group formation made through the API, and no socket connection appeared in the backend log during that run. **TODO:** confirm whether the socket connects from Expo Go. | ios |
| The notifications permission alert appears on the first leave-by reminder, which is the moment the meetup confirms, and covers the screen. Grant it on demo phones beforehand. | ios, demo setup |
| On iOS the logged-out Welcome and public plan pages draw their top bar under the status bar: `SafeAreaView` inside a `Modal` gets no insets. | ios |
| The anonymous gallery on Welcome reads the primary pool, which is the pool seeded last. For the San Francisco demo, load `pool_sf_city` last. | runbook |
| The step timeline unmounts the moment the meetup is confirmed (`Meetup.tsx` `showSteps`), so the last checks and a still-playing faux call are cut off; the call does not replay (`calledMeetups`). | ios |
| The faux call starts after its step is already `done`: the planner sends the book step `queued` then `done`, and the card keys off the done label. The row shows a check and a confirmation code while the card says "Calling". | ios |
| The Little Fern Kitchen meetup (the one with the call) has no payment approval; the approval sheet only appears on the hero plan. One meetup does not show both beats. | demo script |
| The in-app mock goes from interested to matched in one tick, so people joining one by one is only visible on the live backend. | ios (mock) |
| No typing signal for people in CONTRACTS §6; only Muse shows typing. | contracts, backend |
| Synthetic chat lines fall back to templates when Muse times out. | backend |
| Setup steps and Log in are hard cuts; "What Muse picked up" loads behind a bare spinner. | ios |
| `useReducedMotion()` is read once at launch; changing the setting mid-session needs an app restart to apply everywhere. | ios |
| **TODO:** the animated flow has not been watched in motion. Simulator review so far is stills only (nothing can tap the Simulator), and verify, feedback, story and passport were hidden behind the permission alert. The motion notes above come from the code. | |
