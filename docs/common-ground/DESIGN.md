# Common Ground: Design v2

Frozen copy of the design doc (Nov 12, 2026) for agents. It explains why; the contracts and PRDs say exactly what. When they disagree, the contracts and PRDs win.

## Summary

Common Ground (working title) is a people-first Facebook feature where Muse introduces strangers who want friends and reveals only what they share. Laya answers fast yes/no and score questions and drives a simulation of the whole city. Muse does the reasoning, the conversation and the logistics.

| Decision | Choice | Why |
| --- | --- | --- |
| Matching unit | People-first: 1:1 or a small group the user picks | Blind mutual opt-in removes visible rejection |
| Frontend | One Find My-style map page; friend finding opens as an overlay on it | One cohesive product instead of two screens |
| Demo | Native iOS app (Expo), City mode in San Francisco with 300 synthetic users; Event mode shown as a switch | Shows density and the map |
| Demo counterpart | Toggle between a live second phone and synthetic users (Laya-driven, guaranteed yes) | Live when it works, fallback when it doesn't |
| Classifier | Laya replaces BERT | Same engine as the sim; asked only yes/no and score questions |
| Similarity | Interest taxonomy vectors, no embedding model | Exact shared items for the privacy reveal |
| Leaderboard | Ranks scenes, not people | Keeps the competition, drops the shaming |
| Location | The sharer sets exact or neighborhood per friend; viewers can only go coarser | Nobody can upgrade someone else to exact |
| Internal map | Backend-only dashboard; no client route reaches it | It holds everyone's data |

Numbers marked as starting values are tuned in the simulation, not fixed.

## Problem and target user

The user is a young adult who wants friends and is struggling to make them, usually after a move, a first job or a scattered friend group. We only serve people who opt in.

- About 1 in 3 young adults (18 to 25) feel lonely, and 12% say they have no caring friends (Harvard Making Caring Common, via [Newport Institute](https://www.newportinstitute.com/resources/empowering-young-adults/living-with-roommates/)).
- 31% of Americans say they find it hard to make friends, and 53% of them blame shyness (YouGov, via [FOX 11](https://www.foxla.com/news/the-loneliest-generation-22-percent-of-millennials-say-they-have-no-friends-according-to-study)). This is the slide for "we help people who want help."
- Men with no close friends rose from 3% in 1990 to 15% in 2021 (Survey Center on American Life, via [Science of People](https://www.scienceofpeople.com/es/loneliness-statistics/)).

Why Facebook: it already holds the life events (moved, new job), Groups, Events and Messenger that this feature needs. Open item: pull the primary reports before these go on a slide.

## Modes

A mode is only a pool definition: who is eligible, where, and for how long. Matching, the simulation and the Muse agent are identical in every mode, so adding a mode is a config entry.

| Mode | Pool | Window | Why it works | Status |
| --- | --- | --- | --- | --- |
| City | Opted-in users within a radius of home (10 km start) | Always on | Default for people new to a city | Demo, fully built |
| Event | Attendees of a Facebook Event: conference, festival, hackathon | 3 days before to 7 days after | Density is guaranteed and everyone shares a reason to be there | Built, shown as a switch |
| Campus | Verified school email | Semester | Facebook's origin; orientation week is peak loneliness | Specced |
| Group | Local members of a Facebook Group | Always on | Turns an online community into in-person friends | Specced |
| Arriving | People moving to the same city in the next 60 days, plus locals who opt in to welcome them | Until 30 days after the move | Friends before you land; triggered by the "moving" life event | Specced |
| Cohort | Interns and new grads starting in the same city the same season | One season | Intern and new-grad waves hit a city at the same time | Specced |

Density rule (starting values): if a City pool has under 150 opted-in users, or a user has under 5 good candidates, widen the radius. If that still fails, suggest a Group or Event pool where they have overlap. Users only ever see an aggregate count, like "214 people near you are looking for friends."

## People-first flows

Muse suggests people, both sides decide privately, and nothing happens until both say yes. Nobody ever sees a rejection.

1. **Entry.** An opt-in prompt fires on life events Facebook already knows (moved, new job, started school). It also lives behind the map tab's Find people button and in Groups and Events. First launch opens the finder overlay automatically. Nobody joins a pool without saying yes.
2. **Onboarding chat with Muse (about 2 minutes).** Muse asks what you're into, 1:1 or groups, your group size range, availability and neighborhood. It combines that with your Facebook activity and shows the interests it found. You can remove any item or mark it private. Items Laya flags as sensitive start hidden.
3. **Daily drop.** 3 to 5 people, refreshed once a day, shown in the finder overlay on top of the map. Each card shows:
    - name and photo (public profile), or initials and a blurred avatar (private)
    - distance band
    - up to 3 shared interests at the coarse level (Climbing, not Bouldering)
    - Muse's one-line reason

    There is no search and no browsing outside the drop.
4. **Decide.** Connect, Pass, or select several cards for a group. Every choice is private.
5. **Mutual connect.** Muse opens a Messenger thread and reveals shared interests at full depth. It posts an intro and 3 conversation starters, and the person appears in your map's tray. A public profile becomes viewable; a private one never does, and you get shared interests and chat only.
6. **One-sided connect.** The card expires at the end of the drop window. An expired card looks the same whether they passed or never opened the app, so a pass is never visible.
7. **Say hi (both public and private profiles).** You can send one opener to a suggested person without waiting. Laya screens it. They see "Someone who shares climbing said hi" and can reply, which opens the chat, or ignore it silently. Limit: one opener per person per week.
8. **Multi-select and group size.** Pick 2 or more people and a size range. Muse invites each of them. The group forms once enough accept and it passes the compatibility check in Matching. If it fails, Muse fills from your other mutual connects or falls back to 1:1.
9. **Meetups.** Tap "Plan something" in any chat, or Muse offers after a few messages. Muse proposes 2 or 3 options (activity, time, venue) from shared interests and overlapping availability. Everyone votes yes or no on each option, and several yeses are allowed. The first option everyone accepts wins. Muse then creates a private Facebook Event, sends invites and reminders, and handles reschedules. The organizer sets group size, and 1:1 is allowed.
10. **After.** Check-in and three quick questions (see Trust). A group that meets twice gets offered its own Facebook Group.

## Frontend: one map page

The whole feature is one Find My-style map with friend finding as an overlay on top, so the product reads as one thing instead of two screens. It is its own tab in the Facebook bottom bar, between Friends and Marketplace.

**Map (default view):**

- Friend pins: profile photos at the precision each friend allows (see Location).
- Tray along the bottom: friends who share no location, and new connections you haven't met yet, each with chat.
- Upcoming meetups: pins at their venues; tap to open the Event and the group thread.
- Tap a friend's photo to open a bottom sheet with shared interests, quick chat, Meet up, Open in Messenger, and the precision toggle for how you view them.
- A Find people button opens the finder.

**Finder overlay.** The people-first flow on a translucent layer over the map: drop cards, Connect or Pass, multi-select, group size, say hi. A mutual connect drops the person into the tray.

**First launch.** The finder opens automatically. Behind it, the map shows an anonymous density layer of people nearby who are looking, plus a count ("214 near you"). Hex bins with fewer than 10 people are hidden so no one can be singled out.

**Later priority.** Map-aware scheduling: meetup options shown as venue pins, travel times, an "everyone's on the way" view.

**Muse's internal map is never in the app.** It is Muse's view of the whole pool: every opted-in user as a node, candidate and real connections as edges, scenes as colors, isolated users highlighted. It runs as a separate dashboard on the backend's internal network. The API gateway has no route to it, and no client build contains it. The demo shows it on a laptop connected to the backend.

## AI pipeline

Muse reasons and acts, Laya answers fast yes/no and score questions, and plain math does similarity and clustering. Each job goes to whichever is best at it.

```
Facebook activity + onboarding chat
  -> Muse: extract interests (taxonomy tags with evidence)
  -> Laya: sensitive? (yes/no) and strength (0 to 1)
  -> Math: weighted vectors, kNN graph, Leiden scenes
  -> Laya: probability tables (connect, accept, show up, meet again)  <-> Laya simulation (tunes cap and boost)
  -> Math: ranker + fairness -> daily drop
  -> Users: private Connect or Pass (mutual yes only)
  -> Muse agent: intro, starters, options, venue, Event
  -> Meetup + check-in -> feedback updates trust and tables
```

| Job | Who | Why |
| --- | --- | --- |
| Extract interests from posts, Groups, Events and chat into taxonomy tags with evidence | Muse | Open-ended reading across hundreds of categories is LLM work |
| Sensitive-interest gate: religion, health, sexuality, politics | Laya, yes/no | Binary questions are where Laya is strong; runs locally on every tag |
| Interest strength: passing mention or real hobby | Laya, score 0 to 1 | Cheap at scale |
| Similarity, kNN graph, scenes | Math | Deterministic and explainable |
| Connect, accept, show-up and meet-again probabilities | Laya | Feeds both the live ranker and the simulation |
| Who goes in today's drop | Math ranker on Laya's tables | Fairness limits are an optimization, not a prompt |
| Intro, conversation starters, "why you two" line | Muse | Needs voice and judgment |
| Meetup options, venue, Event, invites, reschedules | Muse agent with tool calls | Multi-step coordination |
| Opener, chat and report screening | Laya first; Muse when Laya is unsure | Fast path for clear cases, LLM for the rest |

Routing rule: Laya decides when its confidence is 0.85 or higher; below that, Muse decides. In one independent benchmark, gating Laya at 0.85 covered 69% of cases at 0.953 accuracy ([source](https://huggingface.co/convaiinnovations/laya/discussions/6)). Laya only gets yes/no and score questions, because it trails Jev badly on many-option questions in the same benchmark. Stretch: fine-tune Laya on the synthetic ground truth with its free-GPU notebook.

Muse runs at low reasoning effort for live chat moments and higher effort for batch work like extraction and nightly drops.

## Matching and group formation

Matching scores each pair by the expected chance a friendship forms, then spreads suggestions fairly so popular users don't take every slot.

**Taxonomy.** Three levels, about 400 leaves eventually (v1 ships about 200), for example Outdoors › Climbing › Bouldering. Muse maps each interest to a leaf. Stretch: Muse proposes a new leaf when nothing fits.

**Vectors.** Each leaf's weight is Laya's strength score. Parents get half the child's weight, so Bouldering partly matches Sport climbing through Climbing. IDF weighting across the pool makes a rare shared interest count more than "music" or "food."

**Candidates.** Cosine similarity on the weighted vectors, after hard filters: distance band; at least 2 overlapping free slots a week; age band (18 to 29 default, user-adjustable); trust above the floor; not blocked.

**Graph.** A kNN graph (k = 20) over candidates, then Leiden communities. These are the "scenes" that color the internal map and feed the scene leaderboard.

**Ranker.** Score(A, B) = P(A connects) × P(B connects) × P(both show) × P(both want to meet again), all from Laya's tables.

**Fairness.** Exposure cap: a user appears in at most 8 other people's drops per day. Isolation boost: users with zero connections get priority slots. Diversity: at most 2 suggestions from the same scene per drop.

**Groups.** Maximize the lowest pairwise score in the group, not the average; every member shares at least 1 interest with at least 2 others (groups of 3+); respect each member's size range; no valid group means the best smaller valid group, or 1:1.

## Laya simulation

The simulation compares matching policies on a synthetic San Francisco. The claim it supports is relative and measured: our policy connects more isolated people than greedy matching does.

1. **Seed.** 300 personas with ground-truth interests (some sensitive), availability, neighborhood, group size range, outgoingness and flakiness. A third are low-outgoing with few existing friends; that is the target user. Muse writes 2 to 4 weeks of Facebook activity per persona plus a simulated onboarding chat.
2. **Run the real pipeline on activity only.** Score it against ground truth: extraction precision and recall, sensitive-gate accuracy.
3. **Laya precompute.** About 36,000 yes/no and score answers: connect (both directions, top 20 candidates), accept and show-up per activity type, meet-again per pair. Minutes on [laya-mlx](https://pasqualepillitteri.it/en/news/17538/laya-mlx-jev-apple-silicon).
4. **Monte Carlo in numpy, no model calls.** 8 weeks of daily ticks; a friendship = 2 meetups where both wanted to meet again.
5. **Policies:** random, greedy (top similarity, no limits), Common Ground (ranker + exposure cap + isolation boost + diversity + min-compatibility groups).
6. **Metrics:** share with at least one friendship at weeks 4 and 8, share still isolated among the low-outgoing third, mutual-connect and show-up rates, Gini of friend counts, median days to first meetup.
7. **Robustness.** 50 seeds per policy; flake and connect rates swept ±50%. Only wins that hold across the whole sweep are claimed; never absolute predictions.

## Privacy model

No user sees anything about another user beyond what they share; only Muse holds the full picture. Overlap only; two-stage reveal (coarse on cards, full depth after a mutual connect); sensitive categories start hidden and are shared only if both opted in; no search or browsing, at most 5 Muse-picked people a day; new accounts start group-only; private profiles never shown; passes invisible; the sharer sets location precision; density bins under 10 hidden; the internal map stays server-side; Laya runs on our servers and Muse is Meta's own model API; leaving the pool removes you from the internal map.

## Trust, safety and location

Trust comes from mutually confirmed meetups and is used only for gating, never shown as a number. After every meetup each attendee answers: Did [name] show up? Would you meet them again? Anything we should know? A meetup counts when at least 2 attendees confirm each other and checked in at the venue during the window (150 m, 15 minutes before to 60 after). Reports get a Laya severity check; severe ones pause the account pending review. Safety defaults: public venues only, group or daytime first meetups, one tap to share the plan with a Facebook friend, screened openers and chat, block anytime.

Location on the map: off by default, mutual, per-friend; the sharer sets exact or neighborhood; the viewer can only go coarser; "on my way" and "arrived" during the meetup window; ghost mode; foreground location only in the demo.

## Rewards, leaderboard and virality

Unlocks through confirmed meetups (host at 1, groups up to 8 and extra slots at 3, an optional Regular badge at 5 with no reports). Private streaks. A scene leaderboard that ranks scenes, not people. Virality: a +1 slot for an existing Facebook friend, groups that meet twice become Facebook Groups, opt-in recap posts, a Sunday drop.

## Architecture

| Part | Does | Stack |
| --- | --- | --- |
| iOS app | Map tab, finder overlay, bottom sheets, chat, check-in | The existing Expo clone (SDK 57, Expo Go), react-native-maps on Apple Maps, expo-location |
| Public API | Everything the app calls | Python (FastAPI suggested) |
| Internal API | Simulation, dashboard, demo controls | Same process, loopback only |
| Matching | Vectors, candidates, scenes, ranker, fairness, groups | `cg_matching` (numpy, igraph, leidenalg) |
| Simulation | Seed, Laya precompute, Monte Carlo, report | numpy, laya-mlx or laya-serve |
| Dashboard | Muse's view of the pool, replay, demo controls | Local web app on the laptop |
| AI | Muse via the Meta Model API; Laya self-hosted | |

## Demo script

| Time | On screen | What it proves |
| --- | --- | --- |
| 0:00 | The problem and the stat | Clear young-adult need |
| 0:20 | iPhone: first launch opens the finder over the map, density layer behind | One surface, privacy-safe density |
| 0:45 | Muse onboarding chat; extracted interests with one sensitive item auto-hidden | Muse reads her, Laya protects her |
| 1:30 | Drop cards: a public card, a private card showing only shared interests; multi-select 2 and pick group size | People-first, privacy by design |
| 2:10 | Mutual connect from the second phone (synthetic fallback); Muse's intro and starters; 3 meetup options, votes, Event created, venue pin on the map | Muse coordinates end to end |
| 3:00 | Check-in and the 3 questions; new friends on the map; tap a photo for the bottom sheet, chat and precision toggle | Trust and the return loop |
| 3:30 | Laptop: dashboard replays greedy vs Common Ground over 8 weeks; isolated-share chart | Real math, measured, never in the app |
| 4:15 | Back on the phone: switch to Event mode; scene leaderboard | Modular and extensible |
| 4:40 | Close: why it belongs on Facebook | Fit |

## Q&A prep

| Likely question | Answer |
| --- | --- |
| Why not Bumble BFF or Timeleft? | Facebook already has the Groups, Events and life events, so cold start is smaller. Muse brokers privacy, so strangers never see your full profile. It ends in a planned meetup, not a chat that dies. |
| How do you know the simulation is right? | We claim only that our policy beats greedy on the same population, across 50 seeds and a ±50% sweep. Extraction accuracy is measured against ground truth. |
| Couldn't this work without AI? | No. Muse reads messy activity into interests, decides who to introduce, writes the intro and runs the logistics. Laya gives the probabilities the ranker and simulation run on. |
| Can someone reverse-engineer my hidden interests? | No search or browsing, at most 5 Muse-picked people a day, coarse overlap before a mutual yes, sensitive categories hidden. |
| Is it safe to meet strangers? | Public venues, group or daytime first meetups, share-your-plan, mutual check-ins, trust gating and fast report pauses. |
| Why Laya and not just Muse? | Tens of thousands of yes/no judgments in minutes on our own hardware. Muse handles anything Laya is unsure about. |
| Can a user see Muse's map of everyone? | No. It lives on the backend's internal network with no route from the app. |
| Why a map instead of a feed of matches? | Friendship is local. The map shows the result you came for, real friends nearby, and finding new people is one tap on top of it. |
