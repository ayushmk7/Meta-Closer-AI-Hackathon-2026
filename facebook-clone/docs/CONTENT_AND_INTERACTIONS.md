# Content and interaction contract

## Core rule

The demo starts as fictional **Maya Chen**, already signed in. Its first render is deterministic. Put the entire seed dataset in **one local file** such as `src/data/seed.ts` (use the project's eventual language/convention). Runtime reads no APIs, generates no random content, and hotlinks no images. Every seed image used by the app is bundled under `public/media/` or the equivalent local asset path. Store user changes in `localStorage` under one namespaced, versioned key such as `facebook-clone-demo:v1`; Reset demo removes only that key.

The [reference screenshots](REFERENCES.md) are documentation assets only. Do not use their real names, personal photos, or business-page copy as the app's fictional content.

## Seed inventory

These are stable content slots, not a request to create more screens. Use stable IDs and fixed timestamps or display labels so content order and initial relative-time text do not drift between runs.

| ID | Author/type | Content direction | Local media slot |
| --- | --- | --- | --- |
| `post-01` | Amina Rahman, single photo | Community garden's first harvest; lead with a landscape image like Home slide 5 | `garden-harvest.webp` |
| `post-02` | Leo Ortiz, text | Short invitation to a weekend board-game meetup | — |
| `post-03` | Priya Nair, multi-photo | Three photos from a coastal hike; use a fixed, clean photo grid | `coast-1.webp`–`coast-3.webp` |
| `post-04` | Jordan Ellis, shared link | Neighborhood book swap with title, description, domain-like `.example` label, and preview | `book-swap.webp` |
| `post-05` | Elena Brooks, single photo | Finished pottery pieces at a local studio | `pottery.webp` |
| `post-06` | Maya Chen, text | A friendly note about preparing for the hackathon demo | — |
| `post-07` | Theo Morgan, single photo | A dog resting after a park walk | `park-dog.webp` |

Also seed **five stories** (Maya, Amina, Leo, Priya, Jordan), **at least eight contacts** (including the post authors), **four incoming friend requests**, **six notifications** across posts/friends/messages/Marketplace, **six Marketplace listings**, and **three Messenger conversations** with several fixed messages each. Suggested listing mix: desk lamp, city bike, bookcase, camera, plant stand, and coffee table. Each has a stable ID, title, price, location, and local photo. Friend requests have avatar, name, mutual-friend count, and pending status. Notifications have type, target ID, text, read flag, and fixed display time. All people, listing photos, story images, profile avatar, and cover image must be fictional or have appropriate reusable provenance recorded with the implementation assets.

The exact prose can be polished during implementation. Keep the initial order, variety, IDs, and image assignments stable. Use the same person IDs across posts, stories, contacts, requests, notifications, and conversations; duplicate names/images maintained independently are a source of visible inconsistency.

## Local state and persistence

Keep the immutable seed separate from the mutable overlay. Persist user-created posts/comments/messages, each user's reaction per post, saved-post IDs, request decisions, notification read IDs, and settings. If a visible Profile editor or Marketplace Save control is implemented, persist those edits and saved-listing IDs in the same overlay. Rebuild the visible view from seed plus overlay on load. Reset returns to the same first-run state and must not clear unrelated origin storage. If saved JSON is malformed, or storage quota is reached (especially after a photo upload), show a local error and keep the current session usable instead of silently losing a user's new item.

For a user photo post, accept local image files only; resize/compress before putting a data URL in `localStorage` and enforce a small size cap. No upload, remote image URL, video capture, or broadcast is needed. The visible Photo/video composer action should open this local image picker. If the reference-inspired Live video action is shown, it may open a local explanatory demo panel; it must never ask for camera permission or imply that broadcasting works.

## Navigation map

Use real local routes or equivalent browser-history-aware views. The main views are Home, Profile, Friends, Marketplace, and Settings. Every **visible navigation** label/icon also needs an appropriate populated local destination or panel:

| Visible control | Destination / result |
| --- | --- |
| Facebook mark, Home | Home feed |
| Demo avatar/name, Profile | Maya's Profile |
| Profile tabs: Posts, About, Friends, Photos, More | Local subsections populated from Maya's seed/profile content; More opens a small local menu |
| Friends | Requests, suggestions, all friends, and friends-only seeded activity |
| Marketplace | Local listing grid and listing details |
| Video | Small local media/demo view using bundled media; no streaming |
| Groups | Small local group/demo view using seeded contacts/posts |
| Memories | Local view of selected seeded posts |
| Saved | Posts saved by the current user; clear empty state before any save |
| Feeds | Feed view with active order preference |
| Events | One or more local seeded event cards |
| See more / Menu | Opens a menu containing these same local destinations |
| Search result | Opens the matching post, person, or listing inside the app |
| Notifications | Opens local popover/full-screen mobile view, then target content |
| Messenger / contact | Opens local conversation drawer/full-screen mobile view |
| Settings & privacy | Opens nested account panel; Settings opens Settings page |
| Display & accessibility, Privacy Checkup, Settings categories | Opens the appropriate local settings panel with active controls or a local explanatory view |

Avoid adding a visible destination that has no demo view. A small reused card/list page is enough for secondary destinations; do not invent a full Facebook subsystem. Browser back/forward and direct refresh on the five main views should return to the same view.

## Required interactions

| Feature | Exact local behavior |
| --- | --- |
| Composer | Nonempty text and optional local photo create a Maya post at the top of Home and on Profile; audience selection appears before posting; new post survives refresh. Empty submit does nothing and has a clear disabled state. |
| Reactions | Like opens/sets a reaction; a picker offers Like, Love, Care, Haha, Wow, Sad, Angry by click/tap. A user has one active reaction per post; selecting the same one removes it. Counts and state update and persist. |
| Comments | Open thread, add a nonempty comment, show it immediately under the correct post, update count, and persist. |
| Save post | Toggle via post overflow menu; state persists and the Saved view reflects it. |
| Search | Case-insensitive search across seeded/user posts, people, stories, Marketplace titles/descriptions, and local events. Give grouped results and a no-results state; selecting a result opens the corresponding local view. |
| Friend requests | Confirm or Delete pending requests; cards update immediately and remain changed after refresh. Confirmed people appear in the friend/contact view. |
| Notifications | Badge equals unread enabled notifications. Opening the list and clicking an item marks it read and navigates to its target. “Mark all as read” persists. |
| Messenger | Open one of three seeded conversations; send a nonempty local message with visible time/order; new messages survive refresh. No simulated external recipient or automatic network reply. |
| Marketplace | Search/filter locally, open a listing detail view, and allow a local “Message seller” action that opens a demo conversation. |

## Settings contract

Settings shows the active value of each control without requiring a click. Display & accessibility provides Light and Dark themes. Notifications provides category toggles for friend activity, post activity, Marketplace, and messages; a disabled category stops contributing to unread badge/popover and reappears when re-enabled. Feed preferences provides **Curated order** (the fixed seed order) and **Most recent** (sort by fixed timestamps), with a visible change in ordering. Audience and visibility provides a default for new posts: **Public**, **Friends**, or **Only me**. The composer can override that default for one post, and the chosen audience label appears on the resulting card. All settings survive refresh. Reset demo asks for confirmation, removes only this demo's local state, and restores the exact seed view and default Light theme.

The [audience reference](references/images/audience-selector-ui.png) shows more choices than the minimal local demo needs. Display only the three supported choices as active selectors. The account-menu flow and Settings categories should still look like the [walkthrough](references/images/account-menu-ui.png).
