# Astra prompt: Home feed

> Accepted implementation scope: responsive web + native iOS through Expo Go. Android testing/distribution is deferred. See [architecture and extension contract](../ARCHITECTURE.md).


Implement the **Home feed on responsive web and native iOS** within their shared seed/domain contract. Read `docs/ASTRA_PLAN.md`, `docs/CONTENT_AND_INTERACTIONS.md`, `docs/VISUAL_SPEC.md`, `docs/MOBILE_APP_SPEC.md`, and `docs/SOURCE_ATLAS.md`. Inspect current platform shells and seed state before editing. Preserve established routes and tokens.

## References to inspect

The primary pixel target is [desktop Home slide 5 UI](../references/images/desktop-home-ui.png). Use [slide 6](../references/images/desktop-navigation-slide-06.png) for header tab order, [slide 7](../references/images/desktop-sidebar-slide-07.png) for left rail rows, and [slide 10](../references/images/desktop-composer-slide-10.png) for composer details. For narrow screens inspect the [2026 Home phone crop](../references/images/mobile-home-2026-ui.png), [older feed phone crop](../references/images/mobile-feed-ui.png), [story viewing](../references/images/mobile-dfl-2026-p14-stories-view.png), [composer](../references/images/mobile-dfl-2026-p32-composer.png), and [post interaction](../references/images/mobile-dfl-2026-p34-post-comments.png). [Meta's 2025 Feed update](https://about.fb.com/news/2025/12/making-it-easier-to-create-discover-and-share-content-on-facebook/) supports a stable multi-photo grid and visible composer audience. Ignore teaching-slide graphics and source account content.

## Desktop structure and first fold

The first 900 px should show the sticky header, left navigation, a centered composer card, a horizontal stories strip, the top of the first large-photo post, and the right contacts rail. Keep the composer, stories, and post cards on the same center axis at roughly 600 px max width. Use the white cards, restrained shadow, 8 px-ish corners, 40 px feed avatars, 15 px main text, gray 12–13 px metadata, and compact 8–16 px gaps from the visual spec. Do not stretch the feed to fill the full space between rails. The first seeded post is Amina's landscape garden image, so the photo weight mirrors slide 5 while its people/content stay fictional.

The left rail starts with Maya's avatar/name, then the documented destinations in slide 7's general order; each visible row opens a populated local view. The right rail has a Contacts title, compact avatar/name/online-dot rows, and group chats lower down. Contact clicks open Messenger. In the center, show a compact composer prompt with Maya's avatar, an action row (Photo/video and any locally supported actions), a Create story tile followed by the seven other seeded stories, and then the fixed 24-post feed. Keep the strip horizontally scrollable without growing page width. Preserve the original seven posts at the start of the curated order; append the additional content without generating an infinite feed. Add a finite-feed ending with Back to top, respecting reduced motion on web. Verify real wheel and touch scrolling: Expo’s document reset must not lock the page, while modal dialogs must still lock their backdrop. Story tiles use local images, vertically cropped and bottom-labeled. If a story viewer is shown, it must open a real local viewer with close/next behavior and no external media request.

Each post card has author avatar/name, fixed display time, audience indicator, overflow menu, text, optional photo/grid/link card, reaction/count summary, Like/Comment/Share actions, and a comment entry state. The 24 seed posts include text-only, single-photo, three-photo grid, and shared-link variants. Use one card grammar for all variants. Show Save/Unsave in the overflow menu, reflected in the Saved view. Share may open a local share sheet or copy a local link; never imply external publishing.

## Mobile structure

At 390 × 844 in the phone browser, show one feed column under the compact top controls. The composer row and horizontal story strip precede the first post. Images fill the card width; story cards scroll horizontally; the fixed bottom nav remains reachable. No desktop rails or horizontal page scroll. The phone reference has top-tab navigation from a different version; follow this demo's bottom-bar contract on web and native. Keep post actions large enough to tap and keep comment input above the bottom bar/keyboard.

## Native app implementation

Render the same post variants and fixed order in React Native, using bundled image keys and the native five-tab shell. Use native sheets/screens for the composer, story viewer, post detail, reaction picker, and comments. Pick a user photo from the device library and persist its copied local file as specified in [the native app spec](../MOBILE_APP_SPEC.md#seed-storage-and-local-photos). Keep submit/comment fields clear of the keyboard and safe areas. The web and native versions share post/reaction/comment/save rules; they keep separate local state per installation.

## Local behavior and data

Opening the composer permits nonempty text and optional local photo, shows the current audience before Post, and inserts Maya's new post at the top of Home and Profile. Photo selection is local and size-limited before persistence. A reaction picker offers Like, Love, Care, Haha, Wow, Sad, Angry; selecting one updates only the current user's reaction, and selecting it again removes it. Commenting, Save/Unsave, and post-audience labels persist after refresh. Feed order follows the active Settings preference; fixed timestamps make initial order deterministic. If a post or link preview is selected, route to a focused local post view with its comments.

## Completion check

Capture web Home at **1440 × 900** and **390 × 844**, plus native Home on iOS. Compare header alignment, center width, composer/stories/first-post vertical positions, story crop, right contacts density, phone image width, and bottom-tab clearance. Create a post, react, comment, save, and verify persistence after browser refresh and native relaunch. Confirm a fresh/reset state returns to the exact fixed first post and counts on each platform.
