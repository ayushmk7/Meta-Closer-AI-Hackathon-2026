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

## v2 (PRD-4 step 10)

- Dependencies: `expo-calendar` ~57.0.6 and `expo-notifications` ~57.0.25 via `npx expo install`; `npx expo install --check` passes.
- `app.json` plugins: `expo-calendar` with the contract `calendarPermission` string; `expo-location` when-in-use string now "Common Ground uses your location once, when you check in at a meetup."
- No `aps-environment`. Prebuild auto-applies the `expo-notifications` config plugin whenever the package is autolinked, and that plugin always writes `aps-environment` (default `mode: 'development'`). `package.json` sets `expo.autolinking.exclude: ["expo-notifications"]`, and then `npx expo config --type introspect` shows no `aps-environment`. Expo Go ships the notifications module natively, so local scheduling still works there. A development build would need its own local-only setup.
- Clone code requests no permission. Common Ground requests its own.
- Web icon: `Controls.web.tsx` has a `sparkles` path, and `sparkles-outline` is an alias for it. `Shell.web.tsx` already renders the contributed tab's `activeIcon` in the desktop header, so a `sparkles` / `sparkles-outline` tab renders with no further change.
- Six tabs at 390pt: each tab is `flex: 1` (65pt). The longest label is "Notifications" at 9pt, about 57pt, on one line (`numberOfLines={1}`). Meetups fits. Still needs a check on a real iPhone in Expo Go.
- e2e stories swipe now measures the `.stories` box, because Home sections (the Common Ground card) push the strip down.
- Note for ios: `tests/common-ground/contract.test.ts` fails on two tests (getMeetup example, getMe `setupComplete`) against the v2 openapi. That test is in ios paths and is expected to be rewritten in A1. It is not a shell regression.
- `src/css.d.ts` (`declare module '*.css'`) lets `npm run typecheck` pass on a clean checkout or in CI without the gitignored `expo-env.d.ts`.

## Batch 2

- Dependencies: `expo-camera` ~57.0.6 via `npx expo install` (`CameraView` with `onBarcodeScanned` works in Expo Go) and `qrcode-generator` ^2.0.4 (pure JS with no native module, so the QR is drawn as a View grid). Both are on the §11 allowlist (#39).
- `app.json` plugin: `["expo-camera", { "cameraPermission": "Scan another attendee's code to confirm you met.", "microphonePermission": false, "recordAudioAndroid": false }]`. iOS gets only `NSCameraUsageDescription` and no microphone string (scan only, never records). Android still lists `RECORD_AUDIO`, which doesn't matter because the app only targets iOS.
- Clone code requests no camera permission. Common Ground requests it when the user opens the scanner.

## Batch 4

- Done: `Sheet` (`src/ui/native.tsx`) slides up from the bottom in 250 ms (ease-out) over the existing backdrop fade, using RN `Animated` and no new dependency. Under reduce motion (`AccessibilityInfo.isReduceMotionEnabled`) it appears instantly. It only slides in: closing still uses the Modal fade, because the Modal unmounts on close and a slide-out would need delayed-unmount state. Reanimated was not used because it doesn't load in the jest preset.
- Done: a top-level contributed tab gets its `label` as a bold top-bar title beside the logo, plus its optional `headerAction` (contracts §11 `TabItem.headerAction`) as an icon button before search. Home and every other route are unchanged.

## Batch 5

- Done: `usePostStory()` in `src/extensions/story.ts` (CONTRACTS §11 v2.1.3). A media key posts as is; an http(s) URL is downloaded by `importPhoto(url)` (`src/platform/photo.ts`) into the owned photos directory with the `photo-<ts>-<n>.jpg` name, so `validMedia` accepts it and `reconcileOwnedPhotos` keeps or cleans it like any other story photo. Text is trimmed and capped at 500. Returns the story id or null (failed download, unknown key); a null posts nothing and shows no core error banner. The story lands in the existing persisted `stories` list, so it shows in the Home stories tray and at `/stories/<id>`.
- Web: `importPhoto` returns null (web runs on the mock, which only has media keys). Keys still post.
- Kept out of `registry.ts` so the registry graph stays free of expo modules.
