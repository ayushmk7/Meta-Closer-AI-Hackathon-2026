# PRD 4: Facebook shell integration (prompt for Claude)

**Agent:** shell · **Branch prefix:** `cg/shell/` · **Writes:** `facebook-clone/**` except the Common Ground paths · **Status file:** `facebook-clone/docs/COMMON_GROUND_SHELL_STATUS.md`

You are working in the existing Facebook clone in `facebook-clone/` (Expo SDK 57, Expo Router, web plus native iOS through Expo Go). It is built and passing its checks. Your job is small: add the seams that let a separate agent plug the Common Ground feature in, without that agent touching any clone file. Do not build any Common Ground UI yourself.

Read first: `facebook-clone/docs/ARCHITECTURE.md`, `facebook-clone/docs/EXTENDING.md`, `contracts/CONTRACTS.md` §11, and `docs/common-ground/AGENT_RULES.md`. Inspect `src/extensions/`, `src/ui/Shell.tsx`, `src/ui/Shell.web.tsx`, `src/features/messenger/`, `src/features/secondary/` and `src/platform/` before editing.

## Do this

1. **Dependencies.** Run `npx expo install react-native-maps expo-location expo-blur expo-haptics`. Add the `expo-location` config plugin to `app.json` with `locationWhenInUsePermission: "Common Ground uses your location to show friends who share theirs with you."` Nothing else.
2. **Extension points.** Add `tabs`, `inboxSources`, `eventSources` and `resetHooks` to `FeatureDefinition` exactly as typed in CONTRACTS §11, export `TabItem`, `ExternalRow`, `InboxSource`, `EventSource`, `ResetHook`, and collect them in `collectFeatures`. Keep the duplicate-ID check.
3. **Scoped storage.** Add `src/platform/scopedStorage.ts` (AsyncStorage) and `scopedStorage.web.ts` (localStorage) exporting `createScopedStorage(key)`. Reject keys that do not match `/^[a-z0-9-]+:v\d+$/` or equal the core key.
4. **Native tab bar.** `src/ui/Shell.tsx` renders the five core tabs plus contributed tabs at their `after` position, calling each `useBadge` hook every render. Six tabs must fit at 390 points: keep 26 pt icons, shorten nothing else, keep labels on one line. A contributed tab's `href` counts as top level (bottom bar visible, logo header). Routes nested under that `href` are detail screens with the back button and the tab's `label` as the header title. Keep the existing order of the core tabs.
5. **Messenger and Events.** On native, the chat list shows each `inboxSource` as a labeled section (label as the heading) above the seeded chats, rows rendered like existing chat rows (avatar from `imageUri` or initials, title, subtitle, time, unread dot) and opening `href`. The Events screen does the same with `eventSources`. Web ignores both.
6. **Reset.** Settings › Reset demo runs every `resetHooks[].run()` after the core reset. A failing hook shows the clone's existing error banner and does not undo the core reset.
7. **Web.** Web shows no extra header destination. A feature's `menuItems` still appear in the web Menu as today.
8. **Tests and scripts.** Make `npm test` include `tests/**/*.test.ts` and `npm run test:native` include `tests/**/*.test.cjs`, so `tests/common-ground/` runs. Update `tests/features.test.ts` for the new fields with a fixture that contributes a tab, an inbox source, an event source and a reset hook. The assertion that default Home has no contributed sections stays true until the Common Ground feature registers one; change it to assert that core features contribute none.
9. **Registry entry (second PR).** Ship steps 1 to 8 first, as fast as possible: the ios agent rebases on them. Once the ios agent's first PR is on `main` (it creates `src/features/common-ground/feature.ts` exporting `commonGroundFeature`), open a follow-up PR that imports it in `src/extensions/registry.ts` and appends it last. Never create files in the ios paths, not even a stub.

## Do not

- Change seed content, routes, tokens or any existing behavior beyond the above.
- Add dependencies outside the allowlist, or anything not bundled in Expo Go.
- Reference the backend, Common Ground API types or any network code. The clone stays offline; Common Ground's network code lives in its own folder.

## Done when

- `npm test`, `npm run test:native`, `npm run typecheck`, `npm run lint`, `npm run test:e2e`, `npx expo install --check`, `npm run build:web` and `npm run build:ios` all pass.
- A fixture feature can contribute a tab, Messenger rows, Event rows and a reset hook, proven by tests.
- On an iPhone in Expo Go, the bar shows Home, Friends, Map, Marketplace, Notifications, Menu once Common Ground registers its tab, and every core screen behaves as before.
- `facebook-clone/docs/COMMON_GROUND_SHELL_STATUS.md` lists what you changed and any decision the ios agent should know.

## Open item for the human

The clone's Maya already lives in San Francisco with friends there, while the demo script says "Maya just moved to SF." Either reword the pitch ("Maya wants friends who are into what she's into") or add a "Moved to San Francisco" life event to her seed. That seed change is yours to make only if the human asks.
