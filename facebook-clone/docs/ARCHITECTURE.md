# Implementation architecture and feature contract

The accepted delivery targets are responsive web and native iOS through Expo Go. Android is not an acceptance gate. One Expo/TypeScript project owns a single local seed and state overlay. Preserve all reference material. Runtime media is separate and bundled.

## Ownership and boundaries

- `src/core/types.ts` is the agreed public domain contract. `src/core/store.tsx` exports `DemoProvider` and `useDemo(): DemoContextValue`.
- `src/data/seed.ts` exports `seed: Seed`; `src/data/media.ts` exports `imageSource(ref)` for React Native and `imageUri(ref)` for browser images. Both resolve local assets only.
- `src/platform/photo.ts` (native) and `photo.web.ts` export `pickPhoto(): Promise<string | null>`. Cancellation returns null; failures reject with a user-readable Error.
- Feature screens live in `src/features/<feature>/Screen.tsx` (native) and `Screen.web.tsx` (browser). Thin file-based routes import the feature public entrypoint. Feature internals are private; shared post UI is exported from feed.
- Web shell is `src/ui/Shell.web.tsx`, native shell is `src/ui/Shell.tsx`. Root routes wrap `DemoProvider` and the platform Shell. The shell receives children; all content screens use the same store.
- Web root layout uses `Slot`. Native uses an Expo Router `Stack` with system reduced-motion handling inside the shared Shell; Shell provides the five top-level tabs, safe areas and detail back controls. Local editor/dialog state uses native Modal.
- CSS lives with web views; native styles are separate. Shared semantic tokens live in `src/ui/tokens.ts`.
- Lead owns routing, extension registry, config, shared types and integration. Data agent owns seed/media/store/platform persistence. Web agent owns `.web.tsx` feature files, Shell.web and CSS. Native agent owns default/native feature files, Shell and native UI. No concurrent edits outside these boundaries.

## Stable routes

`/`, `/profile`, `/profile/[id]`, `/friends`, `/marketplace`, `/marketplace/[id]`, `/settings`, `/settings/[section]`, `/notifications`, `/messages`, `/messages/[id]`, `/search`, `/menu`, `/posts/[id]`, `/stories/[id]`, `/video`, `/groups`, `/memories`, `/saved`, `/feeds`, `/events`, `/privacy`.

Query strings select local sections. Shared IDs remain stable. `conversationFor(personId)` returns a stable local conversation ID even for contacts without prior messages. Linking to an absent seeded ID shows an accessible not-found view.

## Extension contract

A static `FeatureDefinition` contributes menu items, Home sections, composer actions or post actions. The registry imports feature public exports explicitly. Route files remain ordinary Expo Router files; a module may own nested routes. Surface components consume `useDemo` to read shared data and invoke actions. No dynamic code loading, global event bus, second router or second state library is needed.

Existing modules use the registry. A fixture tests a new route, menu link and Home surface without registering it in the demo. Defaults must retain the documented initial feed. Extension documentation will include the concrete file/registration recipe.

## State and persistence

Immutable seed + versioned overlay. `DemoProvider` waits for hydration and serializes writes; initial hydration never overwrites saved state. Local storage errors remain visible, with usable in-memory state. Web uses one namespaced localStorage key; iOS uses AsyncStorage plus app-owned document files for photos. Reset deletes only owned data and restores Light/Curated/Friends defaults. Each device/browser is independent.

All `DemoContextValue` collections are ready to render: posts include added comments and the active feed ordering; notifications include active category filtering/read state; friends/requests include decisions. UI derives its current reaction/save flags from `state`. `person(viewerId)` applies profile edits. Each action validates nonempty text and known IDs at the shared boundary.

## Verification

Web: five pages at 1440×900 and 390×844; tablet smoke at 820×1180; overlays and dark mode. iOS: bundle export plus separate real Expo Go runtime checks. Current machine has no Xcode; never label browser captures or bundle export as native runtime evidence. Document exact checks and residual differences in `docs/verification/README.md`.

## Completed implementation checks

See [verification](verification/README.md) for measured layouts, 26 browser captures, tests and exports. Native runtime verification remains pending. Source formatting uses `npm run format`. The SDK-specific URI decoder mitigation and retirement condition are documented in [dependency notes](DEPENDENCIES.md).
