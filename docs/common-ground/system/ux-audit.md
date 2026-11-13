# UX audit (2026-11-13)

A design-quality review of the Common Ground feature inside the Facebook clone: does it read as one Facebook feature (uniformity), and is each screen easy to use (UX). Each is scored 1 to 10 per screen; the bar was 9 on both.

**Result on main `d95ded7`: Uniformity 9.0, UX 9.0** on native iOS, up from 7.0 and 6.9. The final score was read from one clean native set of 14 screens in light and 14 in app dark. Several states were never seen on native; see the limits under Method.

## Method

| What | How |
| --- | --- |
| Screens | Welcome, Setup 1 to 4, Meetups home, Plan pop-up, Meetup, Chat, Person, Verify, Explore, Passport, Settings, Shared meetup (logged out), Demo, Home-feed nudge |
| Native | iPhone 16 simulator, iOS 26.5, Expo Go, live backend as `u_maya`; one deep link and one `xcrun simctl io screenshot` per screen |
| Web | Playwright at 390x844 on the in-app mock; bounding boxes for tap targets, gutters and scroll |
| Judge | One reviewer scoring screenshots against the shell's visual language (`facebook-clone/src/ui/native.tsx`, `tokens.ts`) and the voice rules in `AGENT_RULES.md` R12 |
| Rounds | Thirteen scoring passes between 04:20 and 05:55, each after a batch of fixes |

Limits of the method:

- Until the final set the simulator could not be scrolled or tapped, and even there only one screen was scrolled. Native shots are otherwise the first viewport only. Content below the fold, the approval sheet, the feedback form, the call card, the Muse reply and thinking states, the group-size sheet and the keyboard were judged on web or from code, never on native.
- Scores are one reviewer's judgment, not a measurement. The measurements below are separate and were taken by the Playwright script or read off @2x screenshots.
- Light mode was scored on every pass. App dark mode was reviewed in full twice: pass 4 and the final set.
- The final set (`*-ios-v2.png` and `*-ios-v2-appdark.png`, 06:08 to 06:13, main `d95ded7`, Maya set up and joined to two meetups) is clean: real data, no system prompt, no setup gate. It includes one natively scrolled shot (Meetups home at "Your progress"). An earlier v2 run had the iOS notification prompt over every screen and was replaced.

## Scores

| Pass | Evidence | Uniformity | UX |
| --- | --- | --- | --- |
| 1 | web, mock data, main `e54eec1` | 7.3 | 7.4 |
| 2 | native, first shots, main `501faa5` | 7.0 | 6.9 |
| 4 | native, after #174 and #176 | 7.9 | 7.7 |
| 5 | native, after #180 (branch) | 8.3 | 8.0 |
| 6 | native, #176 + #180 + #181 merged | 8.8 | 8.4 |
| 9 | native, main `726755b` / `1315e1b` | 9.0 | 8.8 |
| 10 | native, route titles in the bar with body titles still present | 8.8 | 8.8 |
| 13 | native, main `d95ded7` (#200, #201, #202 merged) | 9.0 | 9.0 |

Per screen, first native pass against the last:

| Screen | Before (U / UX) | After (U / UX) |
| --- | --- | --- |
| Setup step 1 | 7.5 / 8 | 9 / 9 |
| Meetups home | 6.5 / 6.5 | 9 / 9 |
| Plan pop-up | 7 / 6.5 | 9 / 9 |
| Meetup | 8 / 7 | 9 / 9 |
| Chat | 6.5 / 7 | 9 / 9 |
| Explore | 7.5 / 7.5 | 9 / 9 |
| Passport | 7 / 7.5 | 9 / 9 |
| Person | 8 / 7.5 | 9 / 9 |
| Settings | 7.5 / 8 | 9 / 9 |
| Welcome | 5 / 5 | 9 / 9 |
| Shared meetup | 5 / 5.5 | 9 / 9 |
| Verify | 8 / 8.5 | 9 / 9 |

## Measurements

| What | Before | After | Where |
| --- | --- | --- | --- |
| Shell `Button` height | 42pt | 44pt | `ui/native.tsx`, #168 |
| Shell `Chips` height (Explore filters) | 41pt | 44pt | `ui/native.tsx`, #168 |
| Hero title size | 24/30 and 22/28 | 25/31 everywhere | #166 |
| Card left edge on Meetups home | 0 and 16 on one screen | 0 on every content card | #176 |
| Plan pop-up scroll viewport (web) | 551pt of 844 (two-row footer) | not re-measured; footer is one row | #180 |
| Blank band above plan-card title | about 50pt on device | none (badge overlays the photo) | #176 |
| Settings title-to-content gap | about 57pt and 31pt in adjacent cards | even | #176 |
| Logged-out header top inset | 0 (under the status bar) | below the status bar | #174 |
| Off-switch track contrast, light | 1.23:1 (1.05:1 under system dark) | 5.67:1 | #201 |
| Primary button, white text on fill | 2.90:1 dark, 4.23:1 light | 4.82:1 both | #200 |

Unchanged and already uniform at the start: 16pt page gutter, 17/700 section titles, card radius 8, pill radius 22, colors from `useColors()`.

## Findings and what fixed them

| # | Finding | Fix | PR |
| --- | --- | --- | --- |
| 1 | Welcome and Shared meetup drew their header under the status bar | Safe-area provider inside the modal | #174 |
| 2 | Meetup date contradicted its title ("Sunday…" shown as "Fri 3:12 AM"); later the plan and chat kept the old day | Advance keeps the day; the plan moves with its meetup | #181, #191 |
| 3 | Missing photos rendered as large empty blue blocks (feed cards, plan hero, shares, shared hero) | A photo for every non-sensitive venue; shared page reads the top-level `photoUrl`; Ideas row shows photo cards only | #182, #184, #180 |
| 4 | Cards inset on Meetups home and Passport, full-bleed elsewhere | One card geometry | #176 |
| 5 | "Your passport" was a gray button on the gray canvas | Moved inside the progress card | #176 |
| 6 | Tap targets under 44pt (buttons, filter chips, switch rows, interest remove) | 44pt minimums; rows toggle | #168, #176 |
| 7 | Plan cards reserved an empty badge row; an unmet reason sat between met ones | Badge overlays the photo; reseed with SF as primary pool | #176 |
| 8 | "Your meetups" sat below the carousel and quests | Moved above "For you" | #176 |
| 9 | Plan pop-up and Meetup laid out the same header differently; two-row footer; rectangular "Other times" | One header order, one-row footer, pills | #180 |
| 10 | Chat starters looked like sent bubbles; two header bars; two-row composer | Outlined starters; thread header is the first list item; one-row composer | #180, #183, #188 |
| 11 | "Plan something like this" wrapped to two lines on every Explore post | "Plan this" | #180 |
| 12 | Plan description restated the time, place and price above it | Descriptions say what the activity is like | #190, #192 |
| 13 | Setup step 1 listed four disabled "Coming soon" rows; Continue was below the fold | One muted line | #193 |
| 14 | Venue map went dark on a light page when the phone was in system dark | Map follows the app theme | #180 |
| 15 | A missing chat, profile or code said so twice (banner and card) | Said once | #193, #201 |
| 16 | The top bar said "Meetups" on every pushed screen | Per-route title in the bar; the body titles on Settings, Explore, Verify and Passport removed so each screen names itself once | #197, #202 |
| 17 | Primary buttons and off switches were low contrast | Brand blue behind white text; visible off track | #200, #201 |
| 18 | Passport could read "0 of 0 stamps"; its share icon floated on the canvas | "No stamps yet"; hero starts under the bar | #201, #202 |

Screenshots for every pass are outside the repo, on the machine that ran the audit: `~/cg-orch/artifacts/ux-play/` (`ios-<screen>.png` before, `<screen>-ios-final.png` after) and `~/cg-orch/artifacts/ux-build/`. The full pass-by-pass notes are in `~/cg-orch/findings/ux-fable.md`.

## Open

| # | What | Why it matters | Smallest fix | Owner |
| --- | --- | --- | --- | --- |
| 1 | The shared page of a closed meetup still says "4 people are in · 4 spots left" above "This meetup has closed." | Contradicts itself | Hide the crowd line when the public plan is not open | ios (or backend: omit the counts) |
| 2 | In light mode the off-switch track is a dark gray (5.67:1), heavier than a stock iOS switch | Visible, but could read as "on" at a glance | Lighten toward 3:1 if anyone misreads it in a dry run | ios |

**TODO:** native review of the states listed under Method (below the fold on Plan, Meetup and Chat, approval sheet, feedback form, call card, Muse reply and thinking, group-size sheet, keyboard).
