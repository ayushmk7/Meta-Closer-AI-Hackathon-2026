# Add a feature or subapp

The clone is one application with feature modules. A new feature shares `useDemo()`, the current viewer, theme, local social data and navigation. It may own a whole route subtree or contribute small surfaces to existing pages. There is no backend or dynamic plugin loader.

## Add a route

Create `src/features/your-feature/Screen.tsx` with native React Native views and `Screen.web.tsx` with browser views. Export the screen from the feature's `index.ts`. Add a thin route in `src/app/your-feature.tsx`:

```tsx
export { default } from '@/features/your-feature';
```

For a subapp, add wrappers under `src/app/your-feature/` and a nested `_layout.tsx` if it needs its own navigation. Keep its providers inside that subtree; the root demo provider remains available. Native platform resolution selects `Screen.tsx`; web selects `Screen.web.tsx`.

## Register navigation and surfaces

Export a `FeatureDefinition` from `feature.ts`, then import and append it to `features` in `src/extensions/registry.ts`. For example:

```tsx
import type { FeatureDefinition } from '../../extensions/types';
import HomePreview from './HomePreview';
export const yourFeature: FeatureDefinition = {
  id: 'your-feature',
  menuItems: [{ id: 'your-feature', label: 'Your feature', icon: 'sparkles', href: '/your-feature' }],
  homeSections: [{ id: 'your-feature-preview', Component: HomePreview }],
};
```

Give `HomePreview` native and web implementations when its layout needs to differ. The registry also supports `composerActions` and `postActions`; use the typed context to navigate, open the composer/select a photo, display a message or invoke a shared action. Post action labels receive the current store and post so they can reflect state (for example Save/Unsave).

Existing feed actions and Menu destinations use this registry. Default Home has no additional contributed sections so its reference composition stays intact. The extension fixture in `tests/features.test.ts` verifies a new navigation target and Home surface without registering test content in the app.

## Read and change data

Import `useDemo` from the core store. Collections are derived from the immutable seed plus the local overlay; use the supplied selectors/actions rather than mutating data. UI-only state belongs in the feature. If a future feature introduces durable data, add a typed overlay field, action, validation and reset behavior in core before using it. New seeded content belongs in the single seed file, with cross-references and bundled media checked by tests.

Features import other features only through their public entrypoints. Reuse the exported feed card/composer instead of implementing alternate reaction, comment or save behavior. UI must never read localStorage/AsyncStorage directly. Platform adapters own those operations.

## Check the change

Run `npm test`, `npm run typecheck`, `npm run lint`, and the browser journeys. Verify the new link opens and survives browser refresh, native Back returns correctly, both themes work, every visible control has an action, and reset covers any new persisted state. Capture only the affected screens unless shared shell/styles changed.
