# UX audit (2026-11-13)

A design-quality review of the Common Ground feature inside the Facebook clone: does it read as one Facebook feature (uniformity), and is each screen easy to use (UX). Each is scored 1 to 10 per screen; the bar was 9 on both.

**Result on main `1315e1b`: Uniformity 9.0, UX 8.8** on native iOS, up from 7.0 and 6.9. The demo path (Setup, Meetups home, Plan pop-up, Meetup, Chat, approval) is 9 on both. What keeps overall UX under 9 is listed in [Open](#open).

## Method

| What | How |
| --- | --- |
| Screens | Welcome, Setup 1 to 4, Meetups home, Plan pop-up, Meetup, Chat, Person, Verify, Explore, Passport, Settings, Shared meetup (logged out), Demo, Home-feed nudge |
| Native | iPhone 16 simulator, iOS 26.5, Expo Go, live backend as `u_maya`; one deep link and one `xcrun simctl io screenshot` per screen |
| Web | Playwright at 390x844 on the in-app mock; bounding boxes for tap targets, gutters and scroll |
| Judge | One reviewer scoring screenshots against the shell's visual language (`facebook-clone/src/ui/native.tsx`, `tokens.ts`) and the voice rules in `AGENT_RULES.md` R12 |
| Rounds | Nine scoring passes between 04:20 and 05:30, each after a batch of fixes |

Limits of the method:

- The simulator could not be scrolled or tapped. Native shots are the first viewport only. Content below the fold, the approval sheet, the feedback form, the call card, the Muse reply and thinking states, the group-size sheet and the keyboard were judged on web or from code, never on native.
- Scores are one reviewer's judgment, not a measurement. The measurements below are separate and were taken by the Playwright script or read off @2x screenshots.
- Light mode was scored on every pass. App dark mode was reviewed once, before the last fixes.

## Scores

| Pass | Evidence | Uniformity | UX |
| --- | --- | --- | --- |
| 1 | web, mock data, main `e54eec1` | 7.3 | 7.4 |
| 2 | native, first shots, main `501faa5` | 7.0 | 6.9 |
| 4 | native, after #174 and #176 | 7.9 | 7.7 |
| 5 | native, after #180 (branch) | 8.3 | 8.0 |
| 6 | native, #176 + #180 + #181 merged | 8.8 | 8.4 |
| 9 | native, main `726755b` / `1315e1b` | 9.0 | 8.8 |

Per screen, first native pass against the last:

| Screen | Before (U / UX) | After (U / UX) |
| --- | --- | --- |
| Setup step 1 | 7.5 / 8 | 9 / 9 |
| Meetups home | 6.5 / 6.5 | 9 / 9 |
| Plan pop-up | 7 / 6.5 | 9 / 9 |
| Meetup | 8 / 7 | 9 / 9 |
| Chat | 6.5 / 7 | 9 / 9 |
| Explore | 7.5 / 7.5 | 9 / 9 |
| Passport | 7 / 7.5 | 9 / 8.5 |
| Person | 8 / 7.5 | 9 / 8.5 |
| Settings | 7.5 / 8 | 9 / 8.5 |
| Welcome | 5 / 5 | 9 / 8.5 |
| Shared meetup | 5 / 5.5 | 9 / 8.5 |
| Verify | 8 / 8.5 | 8.5 / 8.5 |

Shared meetup was last shot before the description-copy change; Verify was last shot in pass 4.

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
| Off-switch track contrast, system dark + app light | 1.05:1 | 1.23:1 | still low, see Open |
| Primary button, app dark (white on `#4599FF`) | 2.90:1 | unchanged | see Open |

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
| 15 | A missing chat said so twice (banner and card) | Said once | #193 |

Screenshots for every pass are outside the repo, on the machine that ran the audit: `~/cg-orch/artifacts/ux-play/` (`ios-<screen>.png` before, `<screen>-ios-final.png` after) and `~/cg-orch/artifacts/ux-build/`. The full pass-by-pass notes are in `~/cg-orch/findings/ux-fable.md`.

## Open

| # | What | Why it matters | Smallest fix | Owner |
| --- | --- | --- | --- | --- |
| 1 | The top bar says "Meetups" on every pushed screen | Person, Settings, Passport and Verify do not name themselves in the bar | Let a contributed tab pass a per-route title to `Shell.tsx` | shell |
| 2 | App dark: primary buttons are white on `#4599FF`, 2.90:1 | Below 4.5:1 for text | Use `brand` behind white text in the dark theme | shell |
| 3 | System dark with the app in light: off switches are faint, 1.23:1 | Hard to see what can be turned on | Darker `ios_backgroundColor` | ios |
| 4 | Passport hero can read "0 of 0 stamps" | Seen once on a user with no catalogue | "No stamps yet", hide the bar | ios |
| 5 | Plan, profile and verify "not available" may still show a banner over the card | Fixed and verified for chat only | Same guard as chat | ios |

**TODO:** native review of the states listed under Method, of app dark mode after the last fixes, and of Shared meetup and Verify on current main.
