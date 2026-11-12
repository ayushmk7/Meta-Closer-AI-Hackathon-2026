# Astra prompt: Settings and account menus

> Accepted implementation scope: responsive web + native iOS through Expo Go. Android testing/distribution is deferred. See [architecture and extension contract](../ARCHITECTURE.md).


Implement the full local **Settings** route and account/Menu path on responsive web and native iOS. Read the build brief, source atlas, visual spec, native app spec, and content contract. Inspect the existing theme/state layer and both platform shells before editing so every active value reads from the same shared state rules.

## References to inspect

For desktop, use the [Senior Planet account-menu crop](../references/images/account-menu-ui.png), [Settings categories crop](../references/images/settings-sections-ui.png), [full page 4](../references/images/account-menu-settings-page-04.png), and [audience picker](../references/images/audience-selector-ui.png). For phone, use the [2026 Menu crop](../references/images/mobile-menu-2026-ui.png), [full Menu-to-Settings page](../references/images/mobile-dfl-2026-p25-menu-settings-entry.png), [Settings crop](../references/images/mobile-settings-2026-ui.png), and [full category page](../references/images/mobile-dfl-2026-p26-settings-categories.png). [Meta's Settings architecture note](https://about.fb.com/news/2021/08/facebook-settings-redesign/) helps explain Preferences and Audience and visibility, but its 2021 visuals are not the target.

## Account and Settings path

On desktop web, the avatar opens a right-aligned panel beneath the header. Its top profile card opens Maya's Profile; a **Settings & privacy** row opens a nested panel containing **Settings** and **Privacy Checkup**; **Display & accessibility** is reachable directly from the top account panel. Settings navigates to a full page with the shared header and a left category rail beside a main settings panel. The source menu shows other entries; only add a visible entry if it has a meaningful local destination. In phone web and native app, Menu is a full page of destination tiles, followed by an expandable Settings & privacy section leading to Settings. Settings itself is a single column with a back control, search or compact title row, grouped categories, and no obstructed bottom controls.

## Native app implementation

Use native Menu and Settings screens with the same category labels, active values, and behavior as web. Persist changes in the native overlay; apply Light/Dark to native tabs, headers, lists, dialogs, and sheets immediately. Notification toggles update the native badge/list, feed order changes native Home, and audience default updates the native composer. Native Reset demo confirms, removes only the demo key and owned user-photo files, and returns to the exact initial seed. System Back closes a detail setting before leaving Settings.

## Required settings and visible values

- **Display & accessibility:** Light and Dark choices, with the selected choice visible. Apply the theme to header, canvas, cards, inputs, menus, drawers, and mobile bottom nav immediately; preserve after refresh. Start from the light/dark tokens in the visual spec and verify readable contrast.
- **Notifications:** friend activity, post activity, Marketplace, and messages toggles. Show each on/off value. Disabled categories stop contributing to the unread badge and visible notification list; re-enabling restores relevant seeded notifications. Mark-read state persists separately.
- **Feed preferences:** Curated order and Most recent. Show the selected mode and make switching visibly reorder the deterministic fixed-time feed. Use the same preference in Home and Feeds.
- **Audience and visibility:** default audience for new posts, with Public, Friends, and Only me. The selected value is visible in Settings and preselected in the composer; a per-post override appears on that post card. Use the audience selector's radio-list relationship, but do not show unsupported options as if they worked.
- **Reset demo:** clearly labeled local destructive action inside Settings. Ask for a short confirmation, then delete only the clone's versioned `localStorage` key, restore all initial seed/request/notification/settings values, and return to a predictable route. Do not clear the origin's other storage.

Settings & privacy, Display & accessibility, Notifications, Feed preferences, and Audience and visibility must all be reachable through the account/Menu flow. Privacy Checkup can be a concise local explainer linking to the functional audience and notification controls. Each category row has a real panel with current values; no decorative switches or unlabeled icons.

## Completion check

Capture the desktop account menu, its Settings & privacy submenu, desktop Settings, phone-web Menu/Settings at **390 × 844**, and native Menu/Settings on iOS. Compare nesting, anchoring, category spacing, active states, and phone stacking with the references. Change theme, one notification category, feed order, and audience; refresh/relaunch and check active labels and effects on both platforms. Reset after creating a post and saving a listing; confirm the exact initial state returns while unrelated web/native storage remains.
