# ios status

Milestone: M2 (in progress) on in-app mock (no backend yet)

## Done

- 2026-11-12 Map tab, finder overlay (intro, Muse onboarding, review, Today's people, mutual connect, Waiting for you, empty), chat, meetup (voting, confirmed, check-in, feedback), settings, person, demo identity route, Home card, Messenger and Events rows, reset hook.
- Mock is the default whenever `EXPO_PUBLIC_CG_API_URL` is unset or `EXPO_PUBLIC_CG_MOCK=1`. Fixtures in `mock.ts` derive from `contracts/openapi.json` examples; `tests/common-ground/contract.test.ts` fails if they drift.
- 2026-11-12 M2: chat Plan something opens a form: optional note for Muse (openapi `note` maxLength 280) and, in group threads, a size range bounded by `limits.groupSizeMin`..min(`limits.groupSizeMax`, `capabilities.maxGroupSize`); sends `planMeetup` with only what is set. A failed call keeps the form and note.

## Decisions

- 2026-11-12 Module store on `useSyncExternalStore` (`store.ts`); shell hooks and every CG screen (via `Banners`) call the idempotent `start()`.
- 2026-11-12 Friend sheet uses the clone `Sheet` (pageSheet modal); finder closes by its close button only.
- 2026-11-12 Celebration is one haptic plus a static card (reduced motion satisfied by default).
- 2026-11-12 `index.tsx` / `index.web.tsx` share an extension on purpose: Metro tries extensions before platforms, so `index.ts` would shadow `index.web.tsx`.
- 2026-11-12 Web runs the same screens as iPhone (user override of PRD-1 D5 "web placeholder"), on the mock only: `index.web.tsx` wraps each native screen in the clone's `narrow-page` column (`.cg-page` fixes its height) plus a `SafeAreaProvider`; `maps.web.tsx` stands in for react-native-maps (plain `c.input` box, markers/circles/polygons projected linearly, no tiles, no pan/zoom, no network). `store.start()` now runs on web; `HomeCard` starts the store so the web Home card shows. Shell.web adds contributed `tabs` to the desktop header (`map` icon aliases the `location` pin).
- 2026-11-12 Mock faces use clone media keys `kai`, `lucas`, `ava` (named in the clone's suggestions list).
- 2026-11-12 planMeetup `size` is offered only in group threads; a direct thread's meetup is the two of you, so the server default applies. Friend sheet Meet up stays one tap (no note).

## Needs

- needs: backend live API (Checkpoint A); the real `fetch` path in `api.ts` is untested against a server.

## Known gaps

- No WebSocket realtime; polling at `limits.pollIntervalS` / `mapRefreshS` only.
- Leaderboard and unlocks (§7.6) not built; flags are false.
- Second-phone mode only swaps the display name in the mock; it does not simulate Daniel's world.
- Not yet run on a device in Expo Go; verified by Jest, tsc, lint and both exports.
- Web map is a blank box with projected markers: no tiles, pan or zoom, so anything outside the initial region (e.g. the Lands End venue) is off-box; in light theme the box matches the page canvas.
- Web friend sheet (RN `Modal` pageSheet) covers the whole window, header included, instead of a centered dialog.
- Web header Map tab has no badge (desktop header ignores `useBadge`); phone-width web reaches Common Ground via Menu only.
- Web mock state is in memory, so a hard refresh resets opt-in and reopens the Finder (local prefs persist).
