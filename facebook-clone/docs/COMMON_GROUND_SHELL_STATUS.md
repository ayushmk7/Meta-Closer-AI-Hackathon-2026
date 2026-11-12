# Common Ground shell seams (PRD-4 steps 1–8)

- Dependencies: `react-native-maps`, `expo-location`, `expo-blur`, `expo-haptics` via `npx expo install`; `expo-location` plugin with the when-in-use string in `app.json`.
- `src/extensions/types.ts` exports `TabItem`, `ExternalRow`, `InboxSource`, `EventSource`, `ResetHook` (CONTRACTS §11); `FeatureDefinition` gains optional `tabs`, `inboxSources`, `eventSources`, `resetHooks`.
- `src/extensions/registry.ts` collects and exports `tabs`, `inboxSources`, `eventSources`, `resetHooks`. Common Ground is not registered yet.
- `src/platform/scopedStorage(.web).ts`: `createScopedStorage(key)` rejects keys not matching `/^[a-z0-9-]+:v\d+$/` and the core key.
- `src/ui/Shell.tsx` (native): contributed tabs inserted after their `after` core tab; every `useBadge` runs each render before the loading return; badge uses the notifications style; the tab `href` is top level and nested paths show the tab `label` as header title; tab labels are one line.
- Messenger list and Events (no `?event=`) render each source with rows as a labeled section above seeded content, via the shared `ExternalRowItem` in `src/ui/native.tsx`. Web unchanged (`Shell.web.tsx` untouched).
- Reset hooks run from the core store's `reset()` (`src/core/store.tsx`) after the core reset, each in its own try/catch; failure shows the existing error banner and does not undo. Settings screens are untouched.
- `npm test` globs `tests/**/*.test.ts`; Jest matches `tests/**/*.test.cjs`.
- Note for the ios agent: `core/store.tsx` and `ui/Shell.tsx` import the registry, so `feature.ts` must not import `core/store` or `ui/*` at module top level.
