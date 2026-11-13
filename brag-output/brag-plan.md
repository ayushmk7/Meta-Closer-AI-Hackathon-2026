# Common Ground: demo video plan

Run: /brag (routed to /brag-slim on Opus 5.5). Landscape 1920×1080, 30 fps, 150 s.
Duration overrides the skill's 15–25 s default: this is the hackathon "Demo" section (about 2.5 minutes, one complete journey, animated characters using the app, no scroll-through with voiceover).

## Inspect answers

- **What is it?** A plans-first Facebook feature for young adults who want friends: tell Muse what you want to do, tap I'm in, and Muse forms the group and handles the logistics while you just show up.
- **Who is it for, what does it do for them?** Someone like Maya, who has real hobbies (wheel throwing, coastal hikes, board games) but does them alone. It removes the activation energy: Muse finds the plan, the people, the time, the booking, the calendar and the chat.
- **What sets it apart?** You join plans, not people, so nobody is rejected. Muse is a visible agent: every step it takes is shown, and it asks before money moves.
- **Most impressive claim:** The user makes one decision (I'm in) plus one tap to OK $35. Everything else is Muse.
- **Visual hook:** Maya alone on her couch, her hobbies floating above her each tagged "alone".
- **Real UI to show:** Setup interests with the hidden sensitive item, Muse bar, plan card with checks, plan pop-up (Because, Muse will handle, I'm in), meetup step timeline, approval sheet, group chat with "Muse, can we do 11 instead?", leave-by notification, check-in, People you've met.
- **Tone:** `default` with warmth: playful, clean, character animation like a short explainer.
- **Share caption:** see share-copy.txt.

All on-screen copy comes from `facebook-clone/src/features/common-ground/fixtures.json` and the screen components. Two small changes for consistency with a group of three: the plan card reads "2 in · 3 spots left" and Muse says "already has 2 people in" (fixture: 3 in, 2 spots). The leave-by time (10:38) is derived from the 11 AM reschedule and the 22 min transit estimate. Characters are the seeded fictional personas Maya Chen, Daniel Okafor and Rosa (private profile, first name only).

## Angle

"You just show up." We follow Maya from a lonely Friday night to a Saturday at the wheel with two new friends. The phone is always next to her so the viewer sees exactly what she taps; Muse appears in the world as a small blue helper doing the jobs she would otherwise do.

## Visual identity

- Facebook clone tokens: canvas #F0F2F5, card #FFF, text #050505, secondary #65676B, blue #1877F2, brand #0866FF, online #31A24C. System font (SF Pro via system-ui).
- Muse: blue circle with a white sparkle (as in MuseBar.tsx / Chat.tsx).
- Flat vector characters with jointed limbs (hips, knees, shoulders, elbows), blinking and mouth shapes. Warm, soft backgrounds per location.
- Layout: world on the left, a large phone on the right showing the app. Full-width world for the hook, the group forming, the trip and the payoff.
- Captions: one short lower-third per beat, held ≥0.3 s per word.

## Music and sound

Track: "Happy Beats / Business Moves Vol. 1" by Sascha Ende (CC BY 4.0, credited in the end card). 120.19 BPM, first beat at 3.019 s, bar ≈ 1.997 s. Scene cuts land on bar lines (3.019 + 1.997·n). SFX (Kenney, bundled) sit under the music: soft clicks for taps, keypress for typing, soft impacts for reveals, a bell for "confirmed". Music fades out over the last 4 s.

## Storyboard

| # | Time | Scene | On screen | SFX |
|---|---|---|---|---|
| 1 | 0–11 s | Hook: Friday night | Maya on her couch, phone in hand. Above her: pottery wheel, hiking boot, board game, each stamped "alone". Caption: "Maya loves wheel throwing, coastal hikes and board games. She does all of them alone." Stat card: "About 1 in 3 young adults feel lonely." | soft impact on each "alone" |
| 2 | 11–25 s | Opens Plans | Phone: Muse setup. "Hi Maya, I'm Muse…". Google Maps toggle on. Interest chips arrive with evidence: Coastal hikes (4 visits to Lands End Trail in October), Wheel throwing (Member of SF Clay Collective). "Buddhism" arrives hidden with a lock. Caption: "Muse reads only the apps she connects. Sensitive things start hidden." | switch, card slides |
| 3 | 25–40 s | Asks Muse | Muse bar: types "pottery this weekend". Muse: "I found two ceramics plans that fit your weekend…". Plan card: Wheel-throwing drop-in · Hayes Clay Studio · Sat 10 AM · 2 h · $35; ✓ Fits your Saturday ✓ 22 min by transit ✓ 3 spots left ✓ $35 · Muse can book it. | typing, card slide |
| 4 | 40–54 s | One decision | Plan pop-up: Because, who's in (coarse, no names), Muse will handle (5 lines), Safety. Maya's finger taps I'm in → "You're in. Muse is forming your group." Caption: "That's her only decision." | click, success |
| 5 | 54–66 s | The group forms | Full width: Daniel in a café and Rosa on a bus already joined; three phones light up; lines connect the three; "Maya · Daniel · Rosa — all into wheel throwing". Caption: "Plans, not people: nobody gets picked or passed." | soft impacts |
| 6 | 66–90 s | Muse sets it up | Meetup screen step timeline ticks live (group chat, everyone's free Sat 10–12, 3 wheels open, OK $35). Approval sheet "OK $35 for your wheel?" Maya taps Approve. Booked, calendar, leave-by reminder tick. Muse helper zips around the world: stamps a calendar, books a ticket. Calendar app shows the event. Caption: "Muse does the logistics in front of her. It asks before money moves." | ticks, click, bell |
| 7 | 90–106 s | Group chat | Muse intro + 3 starters. Daniel: "Hi both! Bowls, always. Muse, can we do 11 instead?" Muse checks calendars and the studio: "Done. Everyone's free at 11…". Rosa and Maya reply. Caption: "Plans change. Muse handles that too." | pops |
| 8 | 106–120 s | Saturday | Lock screen: "Leave by 10:38 for Hayes Clay Studio · 22 min by transit". Maya grabs her tote, rides the bus, walks to the studio. | notification, footsteps |
| 9 | 120–138 s | The value | Studio: three of them at wheels, clay spinning, laughing. Check-in. Evening: "How did it go?" stars; People you've met: Daniel, Rosa; "Same time next week?" → yes. Callback: the "alone" stamps from scene 1 flip to "with Daniel & Rosa". | bell |
| 10 | 138–150 s | Outro | Common Ground. "Tell Muse what you want to do. It finds the plan, finds the people, and makes it happen. You just show up." Disclaimer and music credit. | logo bell, fade |

Scene durations sum to 150 s.
