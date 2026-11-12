# Astra prompt: shared shell, seed, and interaction foundation

You are implementing the **shared foundation** of the unofficial Facebook-style hackathon demo. Read `docs/ASTRA_PLAN.md`, `docs/SOURCE_ATLAS.md`, `docs/VISUAL_SPEC.md`, and `docs/CONTENT_AND_INTERACTIONS.md` before editing. Inspect the repository and preserve its existing framework and conventions. Do not implement new product areas beyond the documented demo.

## Visual references to open

- Desktop [Home UI](../references/images/desktop-home-ui.png), [top destinations](../references/images/desktop-navigation-slide-06.png), [left destinations](../references/images/desktop-sidebar-slide-07.png), and [Messenger](../references/images/desktop-messenger-slide-11.png).
- Desktop [account menu](../references/images/account-menu-ui.png).
- Phone [Home](../references/images/mobile-home-2026-ui.png), [Menu](../references/images/mobile-menu-2026-ui.png), and [Settings](../references/images/mobile-settings-2026-ui.png).
- [Meta logo guidance](https://www.meta.com/brand/resources/facebook/logo/) for the circular mark.

## Build the shared frame

At 1440 × 900, use the light desktop shell from Home slide 5: a roughly 56 px sticky white header; blue circular Facebook mark and rounded search control on the left; five centered destinations (Home, Friends, Video, Marketplace, Groups); Menu, Messenger, Notifications, and demo-account avatar on the right. Active navigation uses blue icon/underline. Keep the header the same on Home, Friends, Marketplace, Profile, and Settings. Use the provisional tokens and width ranges in `docs/VISUAL_SPEC.md`, then tune by screenshots. The center Home feed is about 600 px wide; the left and right Home rails are each around 280–300 px. At tablet widths, remove the right rail first.

At 390 × 844, present one content column, compact top brand/search/Messenger controls, and a persistent bottom bar with **Home, Friends, Marketplace, Notifications, Menu**. Hide both desktop rails and centered desktop tabs. Reserve safe bottom space so the bar never covers a composer, comment field, listing, or Settings action. The source phone screenshots show different tab arrangements; keep this demo's five destinations in one order on all pages. The Menu screen uses the 2026 phone reference's tile hierarchy, with functioning local links to Profile, Saved, Groups, Video, Marketplace, Friends, Feeds, Events, Memories, and Settings & privacy.

## Shared panels and navigation

- Header search opens grouped, case-insensitive results for people, posts, stories, listings, and events from the seed plus user additions. Each result navigates to a populated local view. Include an empty-results state.
- The account avatar opens a right-aligned desktop panel: demo profile card, **Settings & privacy**, **Display & accessibility**. Settings & privacy opens a nested panel with **Settings** and **Privacy Checkup**. The mobile Menu leads to the same controls with a back action. Do not show sign-in or a working Log out action in a pre-signed-in demo.
- Notifications opens an anchored desktop popover and a full-screen mobile view. Show unread emphasis, fixed-time labels, a badge driven by enabled unread categories, item target navigation, and Mark all as read. It closes on Escape/outside click where appropriate.
- Messenger opens an anchored desktop drawer or chat panel, using seeded contacts/conversations. Mobile chat gets a full-screen view with clear back control, message history, and send field. A contact row opens its matching conversation. Local send works without fabricated remote replies.
- Every visible header, rail, bottom-bar, menu, tab, search-result, and notification destination has a local route or panel. Support direct refresh and browser back/forward on the five primary routes. Use semantic links/buttons, labeled icon controls, keyboard operation, visible focus, and a single active overlay at a time.

## Seed and persistence contract

Create one deterministic local seed file covering the seven posts and all people, stories, contacts, requests, notifications, listings, events, and conversations specified in `docs/CONTENT_AND_INTERACTIONS.md`. Keep IDs stable across every cross-reference. Bundle every runtime image locally and record its source/reuse rights. Keep user changes in one versioned `localStorage` overlay: new posts/comments/messages, reactions, saved IDs, friend decisions, notification read IDs, and settings. Handle corrupt JSON and storage-write failure with a visible local error. Reset must delete only the clone's namespaced state. No API calls, external runtime image URLs, randomness, or generated feed items.

## Completion check

Open all five primary routes at desktop and phone widths. Confirm the active header/mobile destination, popover anchoring, no horizontal overflow, search targets, a contact chat, and refresh/back behavior. At a fresh run, the exact seeded counts and first post order match the content contract. Leave shared state/types/routes stable for the page agents.
