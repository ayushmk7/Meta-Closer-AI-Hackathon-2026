# PRD 4: Facebook shell integration (prompt for Claude)

**Agent:** shell · **Branch prefix:** `cg/shell/` · **Writes:** `facebook-clone/**` except the Common Ground paths · **Status file:** `facebook-clone/docs/COMMON_GROUND_SHELL_STATUS.md`

You are working in the existing Facebook clone in `facebook-clone/` (Expo SDK 57, Expo Router, web plus native iOS through Expo Go). It is built and passing its checks. Your job is small: add the seams that let a separate agent plug the Common Ground feature in, without that agent touching any clone file. Do not build any Common Ground UI yourself.

Read first: `facebook-clone/docs/ARCHITECTURE.md`, `facebook-clone/docs/EXTENDING.md`, `contracts/CONTRACTS.md` §11, and `docs/common-ground/AGENT_RULES.md`. Inspect `src/extensions/`, `src/ui/Shell.tsx`, `src/ui/Shell.web.tsx`, `src/features/messenger/`, `src/features/secondary/` and `src/platform/` before editing.

**Status (contracts v2):** steps 1 to 9 shipped under v1 and stay as they are; the extension points did not change. v2 needs only step 10. Common Ground's tab is now labeled **Plans** (the feature sets its own label and icons), and there is no map tab.

## Do this

1. **Dependencies.** *(Done in v1.)* `npx expo install react-native-maps expo-location expo-blur expo-haptics`.
2. **Extension points.** *(Done in v1.)* Add `tabs`, `inboxSources`, `eventSources` and `resetHooks` to `FeatureDefinition` exactly as typed in CONTRACTS §11, export `TabItem`, `ExternalRow`, `InboxSource`, `EventSource`, `ResetHook`, and collect them in `collectFeatures`. Keep the duplicate-ID check.
3. **Scoped storage.** *(Done in v1.)* `src/platform/scopedStorage.ts` (AsyncStorage) and `scopedStorage.web.ts` (localStorage) exporting `createScopedStorage(key)`. Reject keys that do not match `/^[a-z0-9-]+:v\d+$/` or that equal the core key.
4. **Native tab bar.** *(Done in v1.)* `src/ui/Shell.tsx` renders the five core tabs plus contributed tabs at their `after` position, calling each `useBadge` hook on every render. Six tabs fit at 390 points. A contributed tab's `href` counts as top level; routes nested under it are detail screens with the back button and the tab's `label` as the header title.
5. **Messenger and Events.** *(Done in v1.)* On native, each `inboxSource` is a labeled section above the seeded chats, and each `eventSource` is a labeled section on the Events screen. Web ignores both.
6. **Reset.** *(Done in v1.)* Settings › Reset demo runs every `resetHooks[].run()` after the core reset. A failing hook shows the existing error banner and does not undo the core reset.
7. **Web.** *(Done in v1.)* Web shows no extra header destination. A feature's `menuItems` still appear in the web Menu.
8. **Tests and scripts.** *(Done in v1.)* `npm test` includes `tests/**/*.test.ts`; `npm run test:native` includes `tests/**/*.test.cjs`.
9. **Registry entry.** *(Done in v1 once the ios agent's `feature.ts` landed.)* `src/extensions/registry.ts` imports `commonGroundFeature` and appends it last.
10. **v2 dependencies and permission strings (new, your v2 M0).**
    - Run `npx expo install expo-calendar expo-notifications`. Keep everything from step 1.
    - In `app.json` `plugins`:
      - Add `["expo-calendar", { "calendarPermission": "Common Ground reads when you're busy (never what your events are) and adds plans you join to a Common Ground calendar." }]`.
      - Add `"expo-notifications"` (local notifications only; no push configuration, no `aps-environment` entitlement).
      - Change the `expo-location` `locationWhenInUsePermission` to `"Common Ground uses your location once, when you check in at a meetup."`.
    - Do not request any permission from clone code; the Common Ground feature requests its own, when needed.
    - Confirm `npx expo install --check` passes and that Expo Go on an iPhone opens the app with no native-module errors.

## Do not

- Change seed content, routes, tokens or any existing behavior beyond the above.
- Add dependencies outside the allowlist, or anything not available in Expo Go.
- Reference the backend, Common Ground API types or any network code. The clone stays offline; Common Ground's network code lives in its own folder.
- Create or edit files in the ios paths, not even a stub.

## Done when

- `npm test`, `npm run test:native`, `npm run typecheck`, `npm run lint`, `npm run test:e2e`, `npx expo install --check`, `npm run build:web` and `npm run build:ios` all pass.
- On an iPhone in Expo Go, the bar shows Home, Friends, Plans, Marketplace, Notifications, Menu, and every core screen behaves as before.
- `facebook-clone/docs/COMMON_GROUND_SHELL_STATUS.md` lists the v2 changes (step 10) and any decision the ios agent should know.

Note for the ios agent's first v2 PR: the app CI job reads `contracts/openapi.json`, which is now v2, so the ios contract test must be rewritten in that PR (PRD-1 §3). That failure is not a shell regression.

## Resolved: Maya's pitch

The clone's Maya already lives in San Francisco with friends there. The human chose the pitch "Maya wants friends who are into what she's into" instead of changing her seed. Do not add a life event or any other seed change for Maya.
