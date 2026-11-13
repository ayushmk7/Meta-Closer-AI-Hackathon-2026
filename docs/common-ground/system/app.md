# App (`facebook-clone`, Common Ground feature)

Expo SDK 57, TypeScript, Expo Router; web and native iOS (Expo Go). The Common Ground feature plugs into the clone through the extension registry and touches no core file (CONTRACTS §11). Status log: `facebook-clone/src/features/common-ground/STATUS.md`.

## Layout

| Path | Role |
| --- | --- |
| `src/app/common-ground/*.tsx` | routes: `index`, `welcome`, `setup`, `plan/[planId]`, `meetup/[meetupId]`, `chat/[threadId]`, `person/[userId]`, `scan/[meetupId]`, `explore`, `passport`, `settings`, `demo` |
| `src/features/common-ground/feature.ts` | registers the tab ("Plans", `after: '/friends'`, `headerAction` gear → settings), menu item, home section, inbox/event sources, reset hook |
| `types.ts` | v2 types + tolerant decoders |
| `api.ts` | client for all REST operations; `CgError`; 30 s timeout on `askMuse`, `createPlan`, `connectConnector` |
| `store.ts` | module-level store (`useCg`, `load.*`, `refreshAll`, `optIn`, `join`, `askMuse`, `decideApproval`, `sendMessage`...); persists `common-ground:v2` |
| `mock.ts` + `fixtures.json` | in-app fake server; fixtures are a verbatim copy of every 2xx `example` in `contracts/openapi.json` (regenerate: `CG_WRITE_FIXTURES=1 npm test`) |
| `realtime.ts`, `calendar.ts`, `notifications.ts` | WS with backoff + polling fallback; device calendar reconcile (`expo-calendar/legacy`); local leave-by reminders |
| `ui.tsx` | shared pieces and motion helpers |
| `*.tsx` screens/components | `Plans`, `Plan`, `PlanCard`, `MuseBar`, `Meetup`, `StepTimeline`, `ApprovalSheet`, `Chat`, `Setup`, `Connectors`, `Settings`, `Demo`, `Welcome`, `Explore`, `ShareCard`, `ShareMeetup`, `VenueMap(.web)`, `Scan(.web)`, `VerifyButton`... |

## Web: D5 mock

`api.MOCK` is true when `EXPO_PUBLIC_CG_MOCK=1`, when no `EXPO_PUBLIC_CG_API_URL` is set, **or whenever `document` exists (web)**. Web always runs on the in-app mock. `index.web.tsx` reuses the native screens inside the clone's narrow column; `Scan.web.tsx` shows the code as text with typed entry (no camera). The mock stages timed transitions with timestamps checked per request, never `setTimeout`.

## Motion helpers (`ui.tsx`, all reduce-motion aware; only `Skeleton` loops)

`enter(i)` (staggered entrance), `PressScale`, `Skeleton`, `Pop`, `MuseThinking` (lines while Muse works). `enter()` is native only; Reanimated web pins its keyframes to `position:absolute`.

## Rewards, Quests, Passport, Surprise, QR verify

All client-only and private to the user (CONTRACTS Decisions); no extra endpoints beyond `Me.rewards`.

- **Rewards** (`Rewards.tsx`): progress from `Me.rewards` (`confirmedMeetups`, `streakWeeks`, `nextUnlock`, from `params.unlocks`).
- **Quests** (`Quests.tsx`, `questLog.ts`): daily goals from the user's own joins/messages/meetups; storage key `common-ground-quests:v1`, cleared by Reset demo.
- **Passport** (`Passport.tsx`, `stamps.ts`): stamps per activity, neighborhood, place met at.
- **Surprise me** (`SurpriseButton.tsx`): opens a random not-joined plan from the viewer's own `getFeed`.
- **QR verify** (`VerifyButton.tsx`, `Scan.tsx`): NFC is not possible in Expo Go, so "show my code, scan theirs" with the same 6 characters for typed entry; `verifyAttendee`; one scan verifies both people. Needs `expo-camera` and `qrcode-generator` (allowlist). The mock accepts any code except your own.
- Demo labels are not rendered (batch 4); the venue phone-call booking is a "Coming soon" teaser only.

## Env (`facebook-clone/.env`, read as literal `process.env.EXPO_PUBLIC_*` so Metro inlines them)

| Var | Meaning |
| --- | --- |
| `EXPO_PUBLIC_CG_API_URL` | `http://<laptop LAN IP>:8000`; unset = mock |
| `EXPO_PUBLIC_CG_USER` | default identity, `u_maya` |
| `EXPO_PUBLIC_CG_MOCK` | `1` forces the mock |

## Run

```sh
cd facebook-clone && npm ci
npm run web               # website, always on the mock
npm start                 # Expo dev server; scan the QR in Expo Go on an iPhone (same Wi-Fi)
npm run ios               # iOS Simulator (needs full Xcode)
npm run typecheck && npm run lint && npm test      # unit tests (tsx --test)
npm run test:native       # jest; npm run test:e2e = Playwright
```

Phone: put `EXPO_PUBLIC_CG_API_URL=http://<LAN IP>:8000` and `EXPO_PUBLIC_CG_MOCK=0` in `facebook-clone/.env`, restart Metro (env is inlined at bundle time), keep laptop and phone on one network (use a hotspot if venue Wi-Fi blocks device-to-device traffic: HUMAN_TODO §3). Simulator: `EXPO_PUBLIC_CG_API_URL=http://127.0.0.1:8000`. **TODO:** the Simulator URL is the obvious value; not verified in this repo. Device checklist: `CHECKPOINT_B.md`.
