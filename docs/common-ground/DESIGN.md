# Common Ground: Design v3

Frozen copy of the design doc (Nov 12, 2026) for agents. It explains why; the contracts and PRDs say exactly what. When they disagree, the contracts and PRDs win.

v3 replaces v2 after two rounds of judge feedback (see [What changed from v2](#what-changed-from-v2)). The people-first daily drop and the Find My-style map are gone. Common Ground is now plans-first, Muse is a visible agent that handles the logistics, and integrations with other apps bring people in.

## Summary

> **Tell Muse what you want to do. It finds the plan, finds the people, and makes it happen. You just show up.**

Common Ground (working title) is a Facebook feature for young adults who want friends. The surface is one screen: a Muse bar at the top ("What do you want to do?"), a carousel of suggested plans below it (an activity at a real place, at a time that fits your calendar), and the plans you're already in. You tap **I'm in** on a plan. Once enough compatible people are in, Muse forms the group and handles the logistics in front of you: it finds the time, books the place, asks before it pays, adds the plan to your calendar, opens the group chat, and tells you when to leave. You do the human part: talking and showing up.

Integrations with other apps (Google Maps, your calendar, Strava, Spotify, Eventbrite, Instagram) let Muse notice the moments when you'd like company, such as going to the same climbing gym alone every week. Muse then suggests a plan there, on Facebook surfaces you already use.

| Decision | Choice | Why |
| --- | --- | --- |
| Matching unit | **Plans**, not people. You join a plan; Muse forms the group from everyone who joined | No one picks or rejects a person, so there is no rejection. One plan needs 3 or 4 yeses, not two strangers choosing each other, so cold start is smaller |
| Surface | One screen: Muse bar, plan carousel, Your plans. No map tab | One story instead of two features. Location appears only where it matters: the venue, travel time, directions |
| AI | Muse is a **visible agent**: every step it takes is shown live and asks first before money moves | Judges asked for AI that is front and center and that removes cognitive load |
| What the user does | Tap I'm in, approve a payment if there is one, show up, talk | Everything else (time, booking, calendar, chat, directions, rescheduling, backfill) is Muse's job |
| Entry | Proactive nudges from connected apps and Facebook activity, shown on Facebook Home, Events and the Plans tab | Judges pointed out the v2 plan assumed people were already in the feature |
| Integrations | Opt-in connectors. Device calendar is real (`expo-calendar`); Google Maps, Google Calendar, Strava, Spotify, Eventbrite and Instagram are simulated from seeded data in the demo | Real where Expo Go allows it, honest about the rest |
| Maps | A service Muse uses (travel time, fair venue choice, leave-by alert, directions in Apple or Google Maps), not a tab | The map was reading as a gimmick next to the main flow |
| Payments | Muse pays only with your permission. Without it, Muse works within its bounds: pay at the venue, a free option, or a hold with no deposit. Simulated in the demo | Lowest-friction booking without surprising anyone |
| Strangers | Groups of 3 or more only. One-to-one plans only with people you've already met | Safer and simpler to pitch |
| Classifier | Laya answers yes/no and score questions; Muse does open-ended reasoning | Same engine as the simulation |
| Similarity | Interest taxonomy vectors, no embedding model | Exact shared items for the privacy reveal |
| Internal map | Backend-only dashboard; no client route reaches it | It holds everyone's data |

Numbers marked as starting values are tuned in the simulation, not fixed.

## Problem and target user

The user is a young adult who wants friends and is struggling to make them, usually after a move, a first job or a scattered friend group. We only serve people who opt in.

- About 1 in 3 young adults (18 to 25) feel lonely, and 12% say they have no caring friends (Harvard Making Caring Common, via [Newport Institute](https://www.newportinstitute.com/resources/empowering-young-adults/living-with-roommates/)).
- 31% of Americans say they find it hard to make friends, and 53% of them blame shyness (YouGov, via [FOX 11](https://www.foxla.com/news/the-loneliest-generation-22-percent-of-millennials-say-they-have-no-friends-according-to-study)).
- Men with no close friends rose from 3% in 1990 to 15% in 2021 (Survey Center on American Life, via [Science of People](https://www.scienceofpeople.com/es/loneliness-statistics/)).

Shy people don't lack interests. They lack the activation energy to turn "I go climbing alone" into "I climb with three people on Saturdays". Common Ground removes that energy: Muse notices the moment, proposes the plan, and does the coordination, the part that usually kills a plan.

Why Facebook: it already holds the life events, Groups, Events and Messenger this needs, and every plan ends as a Facebook Event and a Messenger chat. Connectors pull off-platform life (places, routines, tickets) into Facebook, which brings people back to Facebook. Open item: pull the primary reports before these go on a slide.

## What changed from v2

| Feedback | v2 | v3 |
| --- | --- | --- |
| "You assume people are already in the feature. Integrate with other apps (e.g. Google Maps) to funnel them in, proactively and non-intrusively." | Entry points were Facebook surfaces only; no proactive path | Connectors feed intent signals; Muse turns strong signals into nudges on Home, Events and the Plans tab, with caps and one-tap mute |
| "The map is a second feature, a gimmick next to the people finder. The story isn't cohesive." | Map tab with friend pins, a tray and a finder overlay | No map tab and no friend location. The surface is the Muse bar and plan cards; maps became a service (travel, directions) |
| "AI has to be front end and visible. Let it do the booking and everything else, leaving only the connection to the user, which lowers cognitive load. Add calendar and map integration." | Muse proposed meetup options and people voted | Muse runs the logistics as a visible step timeline, with approvals for money. The calendar picks the time. Maps give travel time and leave-by alerts |

Removed: daily people drop, Connect and Pass, Say hi, group requests and invites, meetup voting, the map tab, friend location sharing and ghost mode, the density layer, the scene leaderboard, and the onboarding chat (replaced by a short setup plus the Muse bar).

## The surface

The whole feature is one screen, its own tab in the Facebook bottom bar between Friends and Marketplace, labeled **Plans**.

```
┌──────────────────────────────────────┐
│ Muse                                 │
│ ┌──────────────────────────────────┐ │
│ │ What do you want to do?        → │ │  Muse bar
│ └──────────────────────────────────┘ │
│  Climb this weekend · Coffee · Run   │  prompt chips
│  Muse is setting up 1 plan for you   │  live status
├──────────────────────────────────────┤
│ ┌ Lands End on Saturday? ──────────┐ │  nudge (only when one exists)
│ │ You've walked Lands End 4 times  │ │
│ │ this month. 5 people want a …    │ │
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤
│ For you                              │
│ ┌────────────────────────┐ ┌──────   │  plan carousel
│ │ photo                  │ │ photo   │
│ │ Wheel-throwing drop-in │ │ Coastal │
│ │ Hayes Clay Studio      │ │ walk    │
│ │ Sat 10 AM · 2 h · $35  │ │ Sat 8:30│
│ │ ✓ Fits your Saturday   │ │ Free    │
│ │ ✓ 22 min by transit    │ │         │
│ │ 3 in · 2 spots left    │ │         │
│ └────────────────────────┘ └──────   │
├──────────────────────────────────────┤
│ Your plans                           │
│  Muse is setting up · Wheel-throwing │  joins and meetups
│  Waiting for 1 more · Game night     │
├──────────────────────────────────────┤
│ People you've met   (avatars)        │
└──────────────────────────────────────┘
```

**Muse bar.** One input, "What do you want to do?". Examples: "climb this weekend", "something chill Sunday", "I just moved here", or a pasted Google Maps link to a place. Muse answers in one or two lines right under the bar and shows matching plan cards. If nothing fits, Muse creates a new plan from the request that others can join. Prompt chips come from your interests. A status line shows what Muse is doing for you right now. The bar is the visible center of the feature, and it replaces the v2 onboarding chat.

**Plan card** (carousel). Photo, title, venue, day and time, duration, cost, the checks Muse already ran (calendar fit, travel time, spots left), how many people are in, and Muse's one-line reason. Tapping a card expands it as a pop-up.

**Expanded plan** (pop-up). Everything on the card, plus: a description, a small static map of the venue (the only map left), "Because" lines that name the signal behind the suggestion ("You've walked Lands End 4 times this month, from Google Maps"), who's in at a coarse level ("3 people · 2 also do ceramics", never names), **Muse will handle** (book 4 wheels, add it to your calendar, open the group chat, remind you when to leave), safety lines (public venue, share your plan with a friend), other times for the same plan, and **I'm in**. After you join, the button becomes "You're in · Muse is gathering people (3 of 4)" with "Can't make it" to withdraw quietly.

**Your plans.** Each plan you joined, with its state: gathering ("waiting for 1 more"), Muse setting it up (live steps), confirmed (time, venue, open chat), or "didn't fill" with similar plans. Pending approvals show a badge here.

**People you've met.** Avatars of people you've been in a confirmed meetup with. Tap to open their profile (public profiles only) or "Plan something again", which creates a plan with them. That is the only way to make a one-to-one plan.

**Meetup screen.** Opened from Your plans, a chat or an Event row. It shows Muse's step timeline as it happens, approvals inline, who's coming with shared interests at full depth, the booking, calendar status, travel time with a Directions button for Apple Maps or Google Maps, On my way and Arrived, check-in, and the after-meetup questions.

**Group chat.** A Messenger-style thread for the group, with Muse as a participant. Muse posts the intro and three conversation starters. Anyone can address Muse ("Muse, can we do 11 instead?") and Muse acts: it checks everyone's calendar and the venue, rebooks, and posts what changed.

## Flows

1. **Entry.** A Muse nudge on Facebook Home, an Events row ("Going alone? 4 others are too"), the Plans tab, a life-event prompt (moved, new job, started school), or the Menu. Nobody joins a pool without saying yes.
2. **Setup (about 30 seconds).** Muse introduces itself and the privacy promise ("People only see what you have in common, and only after a group forms"). You pick the mode (City or Event) and connect any apps you want (each toggle says exactly what Muse reads). Muse shows what it picked up from your Facebook activity and connectors: interests as chips you can hide or remove, plus the signals behind them. Sensitive items arrive hidden with a lock. You choose public or private profile, group size and how far you'll travel. Done.
3. **Find a plan.** Browse For you, tap a nudge, or ask Muse in the bar.
4. **Join.** I'm in. Optional group size preference. Nothing else is asked. If the plan has a fixed time, your calendar gets a hold.
5. **Gathering.** Muse waits for enough compatible people. In DEMO_MODE, a plan forms as soon as it reaches its minimum. Otherwise it forms at its fill deadline (a starting value of 24 hours before start), or immediately when it fills.
6. **Group forms.** `cg_matching.form_groups` splits everyone who joined into one or more groups (12 people in for Saturday bouldering become three groups of 4). Your group is revealed: names (first name only for private profiles), photos for public profiles, and shared interests at full depth. The group chat opens with Muse's intro and starters.
7. **Muse sets it up (the visible part).** Steps tick live on the meetup screen and in a progress card in the chat: everyone is free at that time → the venue has space → payment approval if needed → booked → added to everyone's calendar → Facebook Event created → leave-by reminder scheduled. Each step has a status (queued, running, done, needs you, failed, skipped) and plain copy.
8. **Approve (only if money is involved).** "OK $35 for your wheel?" One tap approves the payment (simulated in the demo, not labeled in the app). Declining, or letting it expire, triggers Muse's in-bounds fallback: pay at the venue, a free option, or releasing your seat with a note to the group. Muse never pays without your approval unless you set an auto-spend limit (default $0).
9. **Day of.** A leave-by local notification ("Leave by 9:28 for Hayes Clay Studio") opens directions. On my way and Arrived are visible to the group. Check-in at the venue.
10. **Changes.** Someone drops out: Muse backfills from people still waiting, or continues if the group is still above its minimum, or cancels with alternatives. Someone asks for a new time: Muse checks calendars and the venue and changes it if everyone stays free and the cost doesn't rise. Otherwise it asks.
11. **After.** The three questions (Did they show up? Would you meet again? Anything we should know?). The people join People you've met. "Same time next week?" A group that meets twice is offered its own Facebook Group.
12. **Didn't fill.** At the deadline the join quietly becomes "This one didn't fill" with 2 similar plans. It looks the same whether too few people joined or the group wasn't compatible, so nobody is ever told they were left out.

## Muse as a visible agent

**Principle:** Muse handles everything except the connection itself. The user makes one decision per plan (I'm in), plus one tap for money if the plan costs something.

| Step | v2 (user did it) | v3 |
| --- | --- | --- |
| Find something to do | Onboarding chat, browse the drop | Type it or tap a card |
| Pick a time | Vote on options | Muse reads free/busy for everyone |
| Book the venue | Manual | Muse (simulated provider) |
| Pay | Manual | Muse, after one tap |
| Calendar | Manual | Muse (device calendar through the app) |
| Get there | Manual | Travel time on the card, leave-by alert, Directions |
| Someone drops or asks to move it | Group back-and-forth | Muse backfills or reschedules |

**Where it shows:** the Muse bar and its status line; checks on every card; "Muse will handle" on the expanded plan; the live step timeline on the meetup screen; a progress card in the group chat; Muse's messages in the chat; approval sheets.

**Autonomy and bounds.** Starting values; the contract carries them as per-user settings so the split can be loosened later without a contract change. The settings UI stays hidden behind `features.autonomySettings` until we want it.

| Muse does on its own | Muse asks first (one tap) | Muse never |
| --- | --- | --- |
| Calendar holds and events, opening the group chat, intro and starters, reminders and leave-by alerts, Facebook Event, backfilling a seat, rescheduling or swapping to a nearby venue when everyone stays free, inside the approved window (same day, ±2 hours) and at no extra cost | Any payment above your auto-spend limit (default $0), any change outside the approved window or that costs more, bringing a plus-one | Share your calendar contents (only free/busy is read), share your exact location, spend beyond what you approved, book anything you didn't join |

Per-user settings: `spendWithoutAskingCents` (0), `autoReschedule` (on), `autoBackfill` (on), `calendarHolds` (on), `leaveByReminders` (on).

**Failures stay visible.** "Hayes Clay Studio is full at 10. I booked 11 instead; everyone's still free." A failed step shows as failed with what Muse did next. The dashboard can force a booking failure during the demo to show this.

**How Muse runs.** Muse is a tool-using agent on the backend (tools for free/busy, travel, venue search, availability, booking, payment requests, calendar directives, chat, reminders, reschedule, backfill and the Facebook Event). Every tool call becomes a visible step. If Muse is unavailable, a scripted planner runs the same tools in a fixed order with templated copy, so the demo never stalls.

## Integrations and proactive entry

Connectors are opt-in, one toggle each, and each says what Muse reads. Disconnecting deletes everything derived from it.

| Connector | Muse reads | Signals | Example plan or nudge | Demo |
| --- | --- | --- | --- | --- |
| Device calendar | Start and end of events only, never titles | Free and busy | Only shows plans that fit; picks the time; writes holds and events | Real (`expo-calendar`) |
| Google Maps | Places you visit often, saved places | `frequent_place`, `saved_place` | "You've walked Lands End 4 times this month" | Simulated |
| Google Calendar | Free and busy | Free and busy | Same as device calendar | Simulated |
| Strava | Routines: activity, area, day, time | `routine` | "Sat 8 AM Crissy Field run, your pace" | Simulated |
| Spotify | Top artists and genres | `artist` | "3 people are going to that show alone" | Simulated |
| Eventbrite | Tickets you hold | `ticket` | "Going alone? 4 others are too" | Simulated |
| Instagram (Meta) | Places and hobbies in your posts | `post` | Interests with evidence | Simulated |

Facebook activity (posts, Groups, Event RSVPs) is always available after opt-in and needs no connector.

**Pasting a Google Maps link.** Pasting a place link into the Muse bar is the demoable Google Maps path. Muse resolves the place against the seeded venue list and shows plans there, or creates one. The backend never fetches the link. An iOS share extension ("Share to Common Ground" from Google Maps) needs a development build, so it is post-hackathon.

**Signals → nudges.** A nudge fires on a strong intent moment, never on loneliness. The copy is about the activity: "You've been to Mission Cliffs 4 times this month. 6 regulars want a Saturday climbing crew. Want in?" It never says "you seem lonely". Strong moments, in order:

1. Places you keep going to alone (Google Maps).
2. Events you hold a ticket for or RSVP'd to with no friends going (Eventbrite, Facebook Events).
3. Routines like a weekly run (Strava).
4. Life events (moved, new job, started school).
5. Groups you joined but never met in person.

**Guardrails.** At most 3 nudges a week (starting value). One nudge per signal. Dismissing offers "Not interested in this place" to mute that source. Signals that are sensitive (a place of worship, a clinic, a support group) are gated by Laya and start hidden. Nudges appear only after opt-in. Before opt-in there is only a generic "Muse can find things to do with people who are into what you're into" card on Home.

**Facebook surfaces.** Home (nudge card or setup card), Events (confirmed plans, plus "Going alone?" rows from tickets), Messenger (group chats), Groups (offered after a group meets twice). Each plan ends as a private Facebook Event. This is the "bring people to Facebook" story: off-platform life comes in as signals, and plans go out as Facebook Events, chats and Groups.

## Maps and calendar as services

**Calendar.** The app reads the device calendar's busy blocks for the next 14 days (start and end only) and sends them to the backend while the app is in the foreground, at most every few minutes. Muse uses free/busy to filter the feed ("✓ Fits your Saturday"), to choose times for Muse-created plans, and to reschedule. The app writes into a dedicated "Common Ground" calendar it creates: a hold when you join a fixed-time plan, the real event when the group confirms (venue, time, directions link; never other people's names), and removal if the plan doesn't fill. The backend sends the desired calendar state per plan, and the app reconciles it and reports back, so Muse's "Added to your calendar" step is honest.

**Maps.** Travel time on every card comes from a server-side estimate (distance × detour factor ÷ mode speed, from your neighborhood centroid, never your exact home). Muse chooses venues for new or rescheduled plans by keeping the longest trip in the group short. The leave-by time drives a local notification. Directions open Apple Maps or Google Maps with only the venue's public coordinates, and only when the user taps. Location itself is read once, at check-in.

## Modes

A mode is only a pool definition: who is eligible, where, and for how long. Plans, matching, the simulation and the Muse agent are identical in every mode, so adding a mode is a config entry.

| Mode | Pool | Window | Why it works | Status |
| --- | --- | --- | --- | --- |
| City | Opted-in users within a radius of home (10 km start) | Always on | Default for people new to a city | Demo, fully built |
| Event | Attendees of a Facebook Event: conference, festival, hackathon | 3 days before to 7 days after | Density is guaranteed; plans like "lunch walk with 4 other solo hackers" | Built, shown as a switch |
| Campus | Verified school email | Semester | Orientation week is peak loneliness | Specced |
| Group | Local members of a Facebook Group | Always on | Turns an online community into in-person plans | Specced |
| Arriving | People moving to the same city in the next 60 days, plus locals who opt in to welcome them | Until 30 days after the move | Plans waiting when you land | Specced |
| Cohort | Interns and new grads starting in the same city the same season | One season | Waves hit a city at once | Specced |

Density rule (starting values): if a City pool has under 150 opted-in users, widen the radius. If plans still don't fill, suggest Event or Group pools where the user has overlap.

## AI pipeline

```
Facebook activity + connector records
  -> Muse: extract interests (taxonomy tags with evidence) and signals (places, routines, tickets)
  -> Laya: sensitive? (interest and place, yes/no) and strength (0 to 1)
  -> Math: weighted vectors, pair affinity, kNN graph, Leiden scenes
  -> Math: propose plans (scene x venue x free time); Muse writes titles and reasons
  -> Laya: probability tables (join, show up per activity type; meet again per pair)  <-> simulation (tunes caps and boosts)
  -> Math: rank plans per user with fairness -> For you carousel; strong signals -> nudges
  -> Users: I'm in (private)
  -> Math: form groups from who joined (max-min compatibility, isolation priority)
  -> Muse agent: time, booking, payment approval, calendar, Event, chat, reminders, changes (visible steps)
  -> Meetup + check-in -> feedback updates trust and tables
```

| Job | Who | Why |
| --- | --- | --- |
| Extract interests and signals from activity and connector records | Muse | Open-ended reading across hundreds of categories |
| Sensitive gate for interests and places | Laya, yes/no | Binary questions are where Laya is strong |
| Interest strength | Laya, score 0 to 1 | Cheap at scale |
| Similarity, pair affinity, scenes, plan proposals, ranking, group formation, travel estimates | Math (`cg_matching`) | Deterministic and explainable; shared with the simulation |
| Join, show-up and meet-again probabilities | Laya | Feeds the ranker, group formation and the simulation |
| Understanding a Muse bar request | Muse (structured output) | Free text to filters or a new plan |
| Plan titles, reasons, nudge copy, intro, starters | Muse | Needs voice |
| Logistics: time, venue, booking, payment request, calendar, Event, reminders, reschedule, backfill | Muse agent with tool calls | Multi-step coordination, visible as steps |
| User-created plan, chat and report screening | Laya first; Muse when Laya is unsure | Fast path for clear cases |

Routing rule: Laya decides when its confidence is 0.85 or higher; below that, Muse decides. In one independent benchmark, gating Laya at 0.85 covered 69% of cases at 0.953 accuracy ([source](https://huggingface.co/convaiinnovations/laya/discussions/6)). Laya only gets yes/no and score questions. Muse runs at low reasoning effort for live moments (the bar, chat, agent steps) and higher effort for batch work (extraction, nightly plans).

## Matching: plans and groups

**Taxonomy and vectors** are unchanged from v2: three levels, IDF-weighted leaf weights from Laya strength, parents at half weight.

**Pair affinity.** Cosine similarity on the weighted vectors after hard filters (age band, trust floor, not blocked). It is used for scenes and group formation, never shown.

**Plan proposals** (`propose_plans`). For each scene: its top activity types × nearby public venues that support them × time windows when many members are free. Plus plans at venues from strong signals (frequent places) and plans from Muse bar requests or users. Each plan has an activity type, venue, time, size range (3 to 6 for strangers), cost and target interests.

**Ranking** (`rank_plans`). Score(user, plan) = P(join | activity type) × P(show | activity type) × interest fit × fill likelihood × travel penalty. Hard filters: calendar conflict, travel over the user's limit, size outside their range, already joined. Fairness: a plan is shown to at most a capped number of people per day so demand spreads across plans; users with no met connections get plans more likely to fill; at most 2 plans per activity type and per scene in a carousel.

**Group formation** (`form_groups`). When a plan forms, split everyone who joined into groups within the size range. Maximize the lowest pairwise score in each group (pair score = affinity × P(meet again)). Every member of a group of 3+ shares at least 1 interest with at least 2 others. Seat priority goes to isolated users, then earliest joins. New accounts are only placed in groups of 3+. Anyone not seated becomes `not_filled`.

**Scenes.** A kNN graph (k = 20) over pair affinity, then Leiden communities. Scenes seed plan proposals, cap carousel diversity and color the internal map.

## Laya simulation

The claim it supports is relative and measured: our policy gets more isolated people into repeat meetups than a greedy, first-come policy does.

1. **Seed.** 300 personas with ground-truth interests (some sensitive), hidden outgoingness and flakiness, neighborhood, group size range, synthetic Facebook activity, synthetic connector records (place visits, routines, tickets, artists, busy blocks), plus a seeded venue list and an initial plan inventory. A third are low-outgoing with few existing friends; that is the target user.
2. **Run the real pipeline on activity and connector records only.** Score it against ground truth: extraction precision and recall, sensitive-gate recall for interests and places.
3. **Laya precompute.** About 21,000 answers: join and show-up per person per activity type, and meet-again per candidate pair.
4. **Monte Carlo in numpy, no model calls.** 8 weeks of daily ticks: plans are proposed, carousels shown, joins drawn, groups formed, show-ups and meet-again drawn. A friendship = 2 meetups where both wanted to meet again.
5. **Policies:** random; greedy (most popular plans, first-come seating, no caps, no isolation priority, no compatibility rule); Common Ground (`rank_plans` + `form_groups`).
6. **Metrics:** share with at least one friendship at weeks 4 and 8; share still isolated among the low-outgoing third; plan fill rate; join-to-meetup rate; show-up rate; Gini of friend counts; median days to first meetup.
7. **Robustness.** 50 seeds per policy; flake and join rates swept ±50%. Only wins that hold across the whole sweep are claimed; never absolute predictions.

## Privacy model

No user sees anything about another user beyond what they share. Only Muse holds the full picture.

- **Before a group forms**, a plan shows only counts and the coarse interests the people in it share with you ("3 in · 2 also do ceramics"). No names, photos or identities.
- **After your group forms**, you see your group members (first name only for private profiles, never their photo) and shared interests at full depth.
- **Not filled and withdrawals are invisible.** Nobody is told who didn't join or why a plan didn't fill.
- **Sensitive interests and places** start hidden and are used for overlap only if both people opted that category in.
- **Signals are owner-only.** Others never see your places, routines, tickets or calendar. "Because" lines appear only to you.
- **Calendar:** only free/busy is read; app-written events carry no other person's name.
- **Location:** no location sharing. Travel times come from your neighborhood centroid. One reading at check-in.
- **No search or browsing of people.** People reach you only through a group you're in or someone you've met.
- **Payments and bookings** are simulated in the demo; flagged in data, not labeled in the app.
- **Data stays home:** user data goes only to Muse (Meta's model API) and Laya (our servers). Opening directions sends only the venue's public coordinates, and only when the user taps.
- The internal map stays server-side; leaving the pool removes you from it; disconnecting a connector deletes its signals.

## Trust and safety

Trust comes from mutually confirmed meetups and is used only for gating, never shown. After every meetup each attendee answers: Did [name] show up? Would you meet them again? Anything we should know? A meetup counts when at least 2 attendees confirm each other and checked in at the venue during the window (150 m, 15 minutes before to 60 after). Reports get a Laya severity check; severe ones pause the account pending review. Defaults: public venues only, groups of 3+ with strangers, daytime first meetups preferred, one tap to share the plan with a Facebook friend, screened chat, block anytime. User-created plans are screened (Laya, then Muse when unsure).

## Rewards and virality

Unlocks through confirmed meetups (create your own plans at 1; bigger groups and more open plans at 3; an optional Regular badge at 5 with no reports). Private streaks. A plus-one slot for an existing Facebook friend (behind a flag). Groups that meet twice become Facebook Groups. Opt-in recap posts. "Same time next week?"

## Architecture

| Part | Does | Stack |
| --- | --- | --- |
| iOS app | Plans tab (Muse bar, carousel, Your plans), plan pop-up, setup, meetup timeline, approvals, chat, calendar sync, local notifications, check-in | The existing Expo clone (SDK 57, Expo Go); `expo-calendar`, `expo-notifications` (local), `react-native-maps` (venue preview only), `expo-location` (check-in only) |
| Public API | Everything the app calls | Python (FastAPI suggested) |
| Internal API | Simulation, dashboard, demo controls | Same process, loopback only |
| Matching | Vectors, scenes, plan proposals, ranking, groups, travel | `cg_matching` (numpy, igraph, leidenalg) |
| Muse agent | Tool loop with visible steps; scripted fallback | Meta Model API (Responses API tools) |
| Simulated providers | Connectors, booking, payment | Inside the backend, fed by seed data |
| Simulation | Seed, Laya precompute, Monte Carlo, report | numpy, laya-mlx or laya-serve |
| Dashboard | Muse's view of the pool, replay, demo controls | Local web app on the laptop |

## Demo script

| Time | On screen | What it proves |
| --- | --- | --- |
| 0:00 | The problem and the stat | Clear young-adult need |
| 0:20 | iPhone, Facebook Home: Muse card "You've walked Lands End 4 times this month (Google Maps). 5 people want a Saturday coastal walk crew." | Proactive, from an integration, non-intrusive |
| 0:40 | Plans tab setup glimpse: connected apps; what Muse picked up; one sensitive place auto-hidden with a lock | Integrations with consent; Laya protects her |
| 1:00 | Muse bar: "pottery this weekend". Muse answers; card shows ✓ Fits your Saturday · 22 min by transit · $35. Open it: who's in (coarse), Muse will handle. Tap I'm in | One decision |
| 1:40 | Second phone (or synthetic) joins; the group forms. Meetup screen: Muse's steps tick live; approval sheet "OK $35"; booked; the event appears in the iPhone's Calendar app; group chat opens with intro and starters | Visible AI doing the work |
| 2:40 | In chat: "Muse, can we do 11 instead?" Muse checks calendars and the studio, rebooks, steps tick again (dashboard can force a booking failure to show the fallback) | Muse coordinates; failures stay visible |
| 3:10 | Leave-by notification opens Apple Maps directions; check-in; the three questions; People you've met | Trust and the return loop |
| 3:35 | Laptop: dashboard replays greedy vs Common Ground over 8 weeks; isolated-share chart; live graph of formed groups | Real math, measured, never in the app |
| 4:15 | Phone: switch to Event mode: "Lunch walk with 4 other solo hackers" | Modular and extensible |
| 4:35 | Close: why it belongs on Facebook | Fit |

## Q&A prep

| Likely question | Answer |
| --- | --- |
| Why not Meetup, Timeleft or Bumble BFF? | Facebook already has the Events, Groups, Messenger and life events, so cold start is smaller. Connectors notice the moment you'd want company instead of waiting for you to search. Muse does the logistics end to end, so plans actually happen. |
| Where is the AI, really? | On screen: Muse reads your request, picks the plans, forms the group, then books, pays (with your OK), calendars, chats and reschedules, each as a visible step. Underneath: Laya's probabilities and the group math. |
| Isn't proactive creepy? | Opt-in per connector, owner-only signals, sensitive places hidden by default, 3 nudges a week max, one-tap mute, and copy about the activity, never about loneliness. |
| What if Muse books the wrong thing? | It asks before any money moves, works only inside the window you approved, and shows every step, including failures and what it did instead. |
| Can someone stalk me through a place? | Plans never reveal who goes where. Before a group forms you see counts and coarse shared interests only. There's no location sharing at all. |
| How do you know the simulation is right? | We claim only that our policy beats greedy on the same population, across 50 seeds and a ±50% sweep. Extraction and the sensitive gate are measured against ground truth. |
| Why Laya and not just Muse? | Tens of thousands of yes/no judgments in minutes on our own hardware. Muse handles anything Laya is unsure about and everything open-ended. |
| Are the integrations real? | The calendar is real on the phone. The other connectors are simulated from seeded data so the demo is reproducible; the pipeline is the same. |
