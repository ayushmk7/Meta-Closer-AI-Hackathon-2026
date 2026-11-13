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

- The anonymous gallery on Welcome reads the primary pool, which is the pool seeded last: for the San Francisco demo, load `pool_sf_city` last.
- Needs a `DEMO_MODE=1` backend with `pool_sf_city` loaded ([runbook.md](runbook.md)). Defaults: `CG_API_URL=http://127.0.0.1:8000`, `CG_INTERNAL_URL=http://127.0.0.1:9001`.
- `--reset` wipes the whole world. On a backend other people are using, run it against a private one on other ports.
- Exit code 0 when all 12 steps pass. Waits: 90 s for the group and for confirmed, 45 s for a chat reply.
- It joins the plan behind the Little Fern Kitchen nudge, approves any pending approval for that meetup, takes another attendee's `verifyCode` to verify, and moves the meetup to `completed` with `POST /internal/v1/demo/meetups/{id}/advance`.
- It asserts the `Reserved a table` label prefix, because the app's faux call depends on that exact backend copy.

What it does not cover: anything on screen, the WebSocket (it polls), device calendar writes, notifications, the camera scan, and the logged-out Welcome page.

## Known gaps

Open on main at `9a598fd` (2026-11-13). Evidence and smallest fixes: orchestrator findings `e2e-run`, `e2e-anim`, `e2e-fable`.

| Gap | Area |
| --- | ---- |
| At the approval and at confirmed, "Open group chat" switches between primary and secondary a few times and a "Private event" label row appears above the avatars, moving them down. | ios |
| The notifications permission alert appears on the first leave-by reminder, which is the moment the meetup confirms, and covers the screen. Left as designed (asked the first time a reminder is needed); grant it on demo phones beforehand. | ios, demo setup |
| The Little Fern Kitchen meetup (the one with the call) has no payment approval; the approval sheet only appears on the hero plan. One meetup does not show both beats. | demo script |
| The in-app mock goes from interested to matched in one tick, so people joining one by one is only visible on the live backend. | ios (mock) |
| No typing signal for people in CONTRACTS §6; only Muse shows typing. | contracts, backend |
| Synthetic chat lines fall back to templates when Muse times out. | backend |
| `useReducedMotion()` is read once at launch; changing the setting mid-session needs an app restart to apply everywhere. | ios |
| Not yet seen on native: the approval sheet (it needs a tap), and the verify, feedback and story cards (below the fold in every capture). The Simulator runs could not tap, so these are covered by `scripts/e2e_flow.py` only. | review |

Closed since the first version of this page: the Welcome top bar under the status bar; the 60 s refresh of joins and the open plan while a join is gathering; the timeline collapsing at confirmed; the faux call starting after its own result (the booking row now spins until the call ends); hard cuts at Log in and between setup steps; no feedback while people join or when the group forms; steps finishing during the faux call, the past-tense booking row while it spins, and the jump at confirmed (#196: later steps are held until the call ends and then tick one at a time); Continue below the fold on setup step 1 (#193, not re-shot); the step that needs the user sitting below the fold on the meetup screen (#199: it and its approval card now scroll into view).

## Review status

Design review of flow and motion, scored 1 to 10 from Simulator screenshot bursts (about 150 ms apart). The track is done at 9 or more on both.

| Build | Flow | Motion | Seen in motion |
| --- | --- | --- | --- |
| main `9a598fd` | 9 | 9 | the hero meetup screen scrolling to "Waiting for you to OK $35" and its "Review payment" card as the step arrives (`e2e-anim/approval-*`, shot on the branch that became #199) |
| main `0e099d0` | 8.5 | 9 | everything below, plus the held steps ticking after the call and no jump at confirmed (`e2e-anim/s9-hold-*`, `s10-hold-*`, shot on the branch that became #196) |
| main `726755b` | 8 | 8.5 | Welcome, Log in, home, plan pop-up, joining, group set, steps, the call, confirmed, chat replies and Muse typing (`e2e-run/final-*`); setup (`e2e-anim/s8-*`) |
| main `b373217` (before the motion fixes) | 6.5 | 6 | stills only |

Reduce Motion was checked on the join, group set, meetup and call bursts (`e2e-anim/s4-reduce-*`): state changes only, and the call card shows its final state at once.

Both scores are at 9, which is the bar this review set. The call pacing was re-shot on merged main (`e2e-run/final-196-fern-steps-call-confirm`). The approval scroll was shot on the #199 branch and on an equivalent e2e-run branch (`e2e-run/final-196-hero-approval-reveal`), not on the merged build; the gaps above are what a 10 would still need.
