# Visual specification

> Accepted implementation scope: responsive web + native iOS through Expo Go. Android testing/distribution is deferred. See [architecture and extension contract](ARCHITECTURE.md).


## Design decision

Build a **personal-account Facebook-style interface for responsive web and native mobile**. [Slide 5](references/images/desktop-home-ui.png) is the main desktop composition target. Keep the same light surfaces, icon treatment, spacing rhythm, and brand across platforms while adapting navigation and layout to each device. [Slide 8](references/images/desktop-profile-ui.png) supplies the desktop Profile structure. The [Senior Planet walkthrough](references/images/account-menu-settings-page-04.png) supplies desktop account/Settings structure. The [2026 Digital for Life mobile guide](SOURCE_ATLAS.md#mobile-screen-map) supplies actual phone screens for native Home, Profile, Friends, Menu, and Settings and also informs phone-browser adaptation; the [older mobile feed example](references/images/mobile-feed-ui.png) is secondary. [Meta's Feed note](https://about.fb.com/news/2025/12/making-it-easier-to-create-discover-and-share-content-on-facebook/) supplies current content behavior where the guides differ.

Reference PDFs are educational slides, not clean product exports. Their surrounding slide typography, colored backgrounds, red annotations, browser tabs, and real-world names are **not** part of the target interface.

## Tokens to implement first

| Role | Light | Dark |
| --- | --- | --- |
| Page canvas | `#F0F2F5` | `#18191A` |
| Header/card/popover | `#FFFFFF` | `#242526` |
| Input/hover | `#F0F2F5` | `#3A3B3C` |
| Main text | `#050505` | `#E4E6EB` |
| Secondary text | `#65676B` | `#B0B3B8` |
| Divider | `#E4E6EB` | `#3E4042` |
| Brand/action | `#0866FF` / `#1877F2` | retain accessible blue contrast |
| Online dot | `#31A24C` | `#31A24C` |
| Unread badge | `#E41E3F` | `#E41E3F` |

These are the brief's starting approximations, supported in broad form by the [palette reference](https://www.aiwebstyle.com/styles/facebook.html). Sample the actual reference UI crops when polishing. Use the [Meta logo guidance](https://www.meta.com/brand/resources/facebook/logo/) for logo shape and placement; do not hand-type a standalone “f” as a substitute mark. Use the browser system-font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`) on web and the platform system font on native if Facebook Sans is unavailable.

## Desktop: 1440 × 900 target

| Area | First-pass target | Visual check |
| --- | --- | --- |
| Top header | Sticky, 56 px high, white, subtle bottom separation | Blue circular mark and search left; main destinations centered; Menu, Messenger, Notifications, avatar right |
| Left rail | Approximately 280–300 px, fixed or sticky below header | Avatar/name followed by Friends, Memories, Saved, Groups, Video, Marketplace, Feeds, Events, See more; compact icon/label rows |
| Center feed | Start at 600 px max width; tune in the 590–680 px range | Crop measurements suggest about 41% of the embedded Home screenshot; composer/stories/post cards share one vertical axis |
| Right rail | Approximately 280–300 px, fixed or sticky below header | Contacts title, compact 40 px avatar rows, small green online dots, group chats lower down |
| Cards | White, about 8 px corner radius, restrained shadow or border | 12–16 px interior padding, 8–16 px vertical gaps, no heavy floating effect |
| Avatars | 40 px in feed and sidebars | Circular crop, consistent alignment to text baselines |
| Typography | 15 px main text; 12–13 px metadata; 16–20 px section headings | Main author name medium/semibold; secondary timestamps gray |

The source screenshot suggests generous empty space between its fixed-width rails and central feed. Do not stretch the center card to consume all remaining width. The Home screenshot captures a vertically scrolling page; the header stays at the top while sidebars can hold their position below it. At a 900 px viewport, the composer, stories, and top of the first post should all be visible without scrolling, as in slide 5.

### Home composition

1. Header: Facebook mark, rounded search field, centered Home/Friends/Video/Marketplace/Groups destinations, then Menu, Messenger, Notifications, and profile avatar buttons. Active Home has a blue icon and blue underline, as shown in [slide 6](references/images/desktop-navigation-slide-06.png).
2. Left rail: [slide 7](references/images/desktop-sidebar-slide-07.png) supplies labels and order. Use distinct, consistent icons; highlight the active destination with a soft gray row.
3. Center: composer card first, stories row next, then feed cards. [Slide 10](references/images/desktop-composer-slide-10.png) shows the compact composer input and action row. Story cards are vertical image tiles with bottom labels, plus a Create story card.
4. Feed card: header with avatar, author, time/audience, overflow button; body text; optional photo/grid/link preview; reaction/count summary; action row; visible comments and input when expanded. The first seeded post should include a large landscape photo, mirroring the image weight in slide 5 without reusing its personal photo.
5. Right rail: compact contacts list and group chats. Clicking a contact opens the Messenger surface, informed by [slide 11](references/images/desktop-messenger-slide-11.png).

### Profile

Use a centered profile container with a wide cover image, overlapping avatar, name and friend count, right-aligned actions, then tabs for Posts, About, Friends, Photos, and More. Under the tabs, use a narrower Intro column and wider post column. [Slide 8](references/images/desktop-profile-ui.png) shows friend suggestions between the identity row and tabs; include a modest seeded suggestion row if it fits without displacing the core Profile structure. The profile is the signed-in fictional demo account, so its composer and authored posts are visible.

### Friends and Marketplace

Friends uses the shared header, with a left section menu or heading, a Friend Requests grid/list with avatar, mutual-friend text, Confirm and Delete buttons, then a People you may know section and friend content where space permits. The [desktop Friends screenshot](references/images/desktop-friends-guidingtech.png) and [2026 mobile request view](references/images/mobile-friends-2026-ui.png) give concrete layouts; [Meta's Friends announcement](https://about.fb.com/news/2025/03/bringing-magic-of-friends-back-to-facebook/) explains the newer friends-only content direction. Marketplace uses the shared header, a search/filter rail where width permits, and a dense responsive card grid with local listing photos, price, title, and location. Use the [desktop Marketplace screenshot](references/images/desktop-marketplace-moonlock.webp) and [mobile App Store screenshot](references/images/mobile-marketplace-2026-ui.png) for structure. These are supplementary references; Home slide 5 still controls the shared desktop visual language.

### Settings and overlays

The account avatar opens a right-aligned panel with the demo profile, **Settings & privacy**, and **Display & accessibility**. Settings & privacy opens a second panel with **Settings** and **Privacy Checkup**. Settings opens a full page with a left category rail and a main setting panel. The local demo must expose Notifications, Feed preferences, Audience and visibility, and Display & accessibility through this flow, plus Reset demo in Settings. [The account crop](references/images/account-menu-ui.png) shows the nesting, and [the settings crop](references/images/settings-sections-ui.png) shows the category treatment. Extra account-menu entries from other Facebook versions are optional; if shown, they need a local action.

Notifications opens a right-aligned popover with unread items, read states, and a clear heading. Messenger opens a right-aligned chat drawer or popover and individual conversation panels; on narrow screens these surfaces take the full viewport. Menus are anchored beneath their trigger, fit within the viewport, close on Escape/outside click, and preserve keyboard focus when possible. Do not layer multiple unrelated popovers over each other.

## Phone browser: 390 × 844 target

At a narrow breakpoint around 700–768 px, hide both desktop rails and the desktop center-tab strip. Use a single full-width feed column with compact card margins or edge-to-edge cards, no horizontal scrolling, and a persistent five-destination bottom navigation. The bottom destinations for this demo are **Home, Friends, Marketplace, Notifications, Menu**. This keeps every primary page reachable and follows [Meta's 2025 note](https://about.fb.com/news/2025/12/making-it-easier-to-create-discover-and-share-content-on-facebook/) that Friends, Marketplace, and Profile become prominent; Profile remains one tap away through the avatar/Menu. Messenger stays in the top-right control. If a Video destination is shown in Menu, it must open a populated demo view.

The mobile top row has compact search/Messenger controls and a Facebook brand treatment, as in [the 2026 Home crop](references/images/mobile-home-2026-ui.png). Keep the composer and stories above the first post. Story cards scroll horizontally. Post photos fill the card width; multi-photo posts use a stable grid. The [mobile Profile crop](references/images/mobile-profile-2026-ui.png) shows cover/avatar overlap and actions; [Menu](references/images/mobile-menu-2026-ui.png) and [Settings](references/images/mobile-settings-2026-ui.png) show the stacked settings path. Account, notifications, and chat surfaces become full-screen sheets or pages with a clear close/back action. Match the demo's chosen bottom-nav order consistently rather than copying different orders from different source versions.

## Native iOS phone layouts

Use the same phone references and five-destination bottom-tab order in a real React Native screen tree. The native layout is portrait-first, with platform safe areas, system status/navigation bars, and a keyboard-aware composer/comment/chat input. The tab bar belongs to Home, Friends, Marketplace, Notifications, and Menu; Profile and Settings can be stack screens with back controls. Use native stack or sheet transitions for post, story, listing, conversation, search, Profile subsections, and Settings detail screens; iOS back gestures must close them predictably. Keep the first-fold content order and card/image proportions aligned with the phone-browser design, then tune platform font and control dimensions from native captures. See the [native page map](MOBILE_APP_SPEC.md#native-page-map) for each screen and the [native evidence contract](MOBILE_APP_SPEC.md#visual-and-build-evidence).

## Other screen sizes and accessibility

At tablet web widths, keep the feed capped and drop the right rail first; drop the left rail at the mobile breakpoint. Never let a rail overlap the feed or create horizontal overflow. Use semantic buttons/links, visible focus rings, labels for icon-only controls, keyboard-accessible menus and dialogs, alt text for meaningful photos, and contrast that remains readable in both themes. On native, provide accessibility labels, touch targets, safe-area spacing, and keyboard avoidance. Respect reduced-motion preferences; hover-only affordances must also work by click/tap.

## Visual comparison protocol

Once implemented, capture **Home, Profile, Friends, Marketplace, and Settings in the browser at both 1440 × 900 and 390 × 844, and in native iOS runtimes**. Smoke-check web routes around **820 × 1180**. Also capture desktop account menu/notifications/Messenger and native Menu/notifications/chat/composer. Compare app content with this pack for: (1) overall column proportions, (2) header/icon alignment, (3) composer/story/post vertical rhythm, (4) cover/avatar overlap, (5) menu widths and anchoring, (6) typography and gray/blue values, and (7) image aspect ratios/crops. Native status bars and system fonts can differ from the teaching screenshots. Fix the largest visible mismatch first, then recapture. Record unresolved differences in verification notes.
