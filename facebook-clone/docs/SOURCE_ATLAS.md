# Desktop and mobile source atlas

This is the research index for the **unofficial, private hackathon demo**. The references are snapshots of different Facebook releases, regions, devices, and account types. Use them as evidence for the specific surface named below. A publisher/page date or PDF creation date does **not** prove when an embedded Facebook screenshot was captured. The [visual specification](VISUAL_SPEC.md) and [page prompts](prompts/README.md) resolve conflicts into one demo design.

## Source priority and use

| Priority | Source and date | Platform / local evidence | Use and limit |
| --- | --- | --- | --- |
| **1** | [Sun City Summerlin Computer Club, *Facebook Basics 2025*](https://www.scscc.club/smnr/FacebookBasics2025.pdf) | Desktop: [Home slide 5](references/images/desktop-home-ui.png), [navigation slide 6](references/images/desktop-navigation-slide-06.png), [sidebar slide 7](references/images/desktop-sidebar-slide-07.png), [Profile slide 8](references/images/desktop-profile-ui.png), [composer slide 10](references/images/desktop-composer-slide-10.png), [Messenger slide 11](references/images/desktop-messenger-slide-11.png) | Primary desktop geometry, hierarchy, and first fold. Slide graphics and browser chrome are outside the app. |
| **1** | [Senior Planet, *Using View As on Facebook Profile*, September 2025](https://web.archive.org/web/20251001021747id_/https://seniorplanet.org/wp-content/uploads/2025/09/Using-View-As-on-Facebook-Profile-handout-for-SMT-9.11.25.pdf) | Desktop: [account menu](references/images/account-menu-ui.png), [Settings categories](references/images/settings-sections-ui.png), [audience selector](references/images/audience-selector-ui.png) | Account-menu nesting, Settings section treatment, and audience choice UI. The [original URL](https://seniorplanet.org/wp-content/uploads/2025/09/Using-View-As-on-Facebook-Profile-handout-for-SMT-9.11.25.pdf) returned 404 on 11 November 2026; the local PDF is the archived copy. |
| **1 for mobile layout** | [Singapore Digital for Life, *Social Media / Communicate Online*, PDF created February 2026](https://files.app.optical.gov.sg/digital4life/production/assets/b005fecc-c573-41af-9626-82f57215c411.pdf) | Mobile: [Home](references/images/mobile-home-2026-ui.png), [Profile](references/images/mobile-profile-2026-ui.png), [Friends](references/images/mobile-friends-2026-ui.png), [Menu](references/images/mobile-menu-2026-ui.png), [Settings](references/images/mobile-settings-2026-ui.png), plus the [page map below](#mobile-screen-map) | Best multi-page phone walkthrough. It compares Facebook with Instagram on some pages and has purple teaching frames; use only the Facebook UI. The 52.8 MB source PDF stays linked remotely; selected rendered pages and crops are local. |
| **2** | [Meta, *Making it Easier to Create, Discover, and Share Content on Facebook*, December 2025](https://about.fb.com/news/2025/12/making-it-easier-to-create-discover-and-share-content-on-facebook/) | Desktop/mobile behavior; [article header image](references/images/meta-feed-update-header.png) | Confirms newer feed/navigation direction, standardized multi-photo grid, prominent composer audience control, and refreshed mobile menu. Article art is not a screen layout. |
| **2** | [Meta, *Bringing the Magic of Friends Back to Facebook*, March 2025](https://about.fb.com/news/2025/03/bringing-magic-of-friends-back-to-facebook/) | Mobile Friends behavior | Friends tab combines friend stories, posts, reels, birthdays, and requests. For this demo, requests and friends-only posts are enough; no video engine is needed. Rollout and tab position vary by region/account. |
| **2** | [Meta, *Facebook Marketplace Gets a Glow Up*, November 2025](https://about.fb.com/news/2025/11/facebook-marketplace-gets-a-glow-up/) | Marketplace behavior | Supports listing details, saved items/collections, and seller conversations. Do not infer a complete page layout from this announcement. |
| **2** | [Meta, *Facebook Marketplace's New Meta AI Tools Make Selling Faster and Easier*, March 2026](https://about.fb.com/news/2026/03/facebook-marketplace-new-meta-ai-tools-make-selling-faster-and-easier/) | Marketplace behavior | Confirms that listing, browsing, and buyer messaging remain core flows. AI listing, shipping, and seller ratings are outside this local demo. |
| **2** | [Meta Facebook logo guidance, updated December 2024](https://www.meta.com/brand/resources/facebook/logo/) | Brand | Authority for the complete circular mark, color/clear space, and minimum digital size. Download the official mark when implementing; do not trace the slide's low-resolution logo. |
| **3** | [Guiding Tech, desktop friend-request walkthrough, updated April 2024](https://www.guidingtech.com/how-to-see-sent-friend-follow-requests-facebook-instagram/) | Desktop: [Friends screenshot](references/images/desktop-friends-guidingtech.png) | Concrete Friends side menu, requests area, Confirm/Delete cards. Purple arrow and browser toolbar are annotations/chrome. Secondary because older than the main guide. |
| **3** | [Moonlock, Marketplace screenshot; image capture date unverified](https://moonlock.com/facebook-marketplace-scams) | Desktop: [Marketplace grid screenshot](references/images/desktop-marketplace-moonlock.webp) | Concrete left browse/filter rail, square-ish listing photos, price/title/location density. The article has 2026 text while the image URL includes `2024/03`; treat its exact UI age as uncertain. The listing data and browser chrome are not runtime content. |
| **3** | [Shopify, Facebook ad-size guide, updated May 2026](https://www.shopify.com/blog/facebook-ad-sizes) | Desktop: [Marketplace screenshot](references/images/desktop-marketplace-shopify.png) | Confirms modern Marketplace rail/grid proportions and typography. This crop includes a sponsored placement and is scrolled; do not reproduce the ad. |
| **3** | [Meta's Facebook iOS App Store listing](https://apps.apple.com/us/app/facebook/id284882215) | Mobile: [Marketplace promotional screenshot](references/images/mobile-marketplace-appstore.jpeg), [UI crop](references/images/mobile-marketplace-2026-ui.png) | Clear phone grid, tabs, price treatment, and bottom navigation. This is App Store marketing art, so the blue frame and emoji are not app UI; screenshot version may differ from the installed app. |
| **3** | [The Marketing Crowd, February 2026 business-marketing deck](https://themarketingcrowd.ie/wp-content/uploads/2026/02/Facebook-Busines-Page-for-marketing-02.26.pdf) | Mobile: [slide 41](references/images/mobile-feed-slide-41.png), [phone crop](references/images/mobile-feed-ui.png) | Secondary feed/card evidence only. The phone screenshots appear older and the deck is business-oriented. |
| **4** | [Australian eSafety Commissioner, Be Connected guided tour](https://beconnected.esafety.gov.au/topic-library/social-media-apps/using-facebook/a-guided-tour-of-facebook) | Desktop behavior; publisher date unclear | Explains main menu, friend-request actions, profile, notifications, and Messenger. Some wording/UI is from an older version; do not use as pixel target. |
| **4** | [Meta, Settings redesign, August 2021](https://about.fb.com/news/2021/08/facebook-settings-redesign/) | Settings information architecture | Confirms Preferences and Audience and Visibility grouping. Older source; the 2025 handout and 2026 mobile PDF control visible appearance. |
| **4** | [AI Web Style Facebook palette](https://www.aiwebstyle.com/styles/facebook.html) | Color estimates | Starting tokens only. Sample reference images and honor Meta's logo rules. |

## Mobile screen map

The Digital for Life PDF has **44 PDF pages**. File suffix `pNN` uses the PDF's one-based page number; the page number printed on the slide is usually one less. Each full page preserves captions and context. The five focused crops remove most teaching-frame material. Some pages include Instagram columns; use the Facebook column only.

| PDF page | Local render | Relevant UI detail |
| --- | --- | --- |
| 7 | [Icons](references/images/mobile-dfl-2026-p07-icons.png) | Home, composer, and Like icon conventions |
| 10 | [Composer entry](references/images/mobile-dfl-2026-p10-composer-entry.png) | Feed composer and create-post flow |
| 12 | [Reactions](references/images/mobile-dfl-2026-p12-reactions.png) | Post reaction row |
| 13 | [Comments](references/images/mobile-dfl-2026-p13-comments.png) | Post comment entry and keyboard state |
| 14 | [View story](references/images/mobile-dfl-2026-p14-stories-view.png) | Story row placement and viewer |
| 15 | [Create story](references/images/mobile-dfl-2026-p15-stories-create.png) | Story entry and media choice |
| 16 | [Add friend](references/images/mobile-dfl-2026-p16-add-friend.png) | Profile action placement |
| 22 | [Profile](references/images/mobile-dfl-2026-p22-profile.png), [UI crop](references/images/mobile-profile-2026-ui.png) | Cover/avatar overlap, name, actions, suggestions |
| 23 | [Edit profile](references/images/mobile-dfl-2026-p23-profile-edit.png) | Cover, bio, and detail section structure |
| 25 | [Menu → Settings](references/images/mobile-dfl-2026-p25-menu-settings-entry.png), [Home crop](references/images/mobile-home-2026-ui.png), [Menu crop](references/images/mobile-menu-2026-ui.png) | Header, Menu tiles, nested Settings & privacy path |
| 26 | [Settings categories](references/images/mobile-dfl-2026-p26-settings-categories.png), [UI crop](references/images/mobile-settings-2026-ui.png) | Preferences, Notifications, Dark mode, Audience and visibility |
| 28 | [Find friends](references/images/mobile-dfl-2026-p28-find-friends.png) | Search, add-friend action |
| 29 | [Friends list](references/images/mobile-dfl-2026-p29-friends-list.png) | Profile friend grid and recent-friend list |
| 30 | [Friend requests](references/images/mobile-dfl-2026-p30-friend-requests.png), [UI crop](references/images/mobile-friends-2026-ui.png) | Friend-request list, mutual friends, Confirm/Delete |
| 32 | [Composer](references/images/mobile-dfl-2026-p32-composer.png) | Text and media choices |
| 33 | [Post draft](references/images/mobile-dfl-2026-p33-post-draft.png) | Audience and Post action |
| 34 | [Post comments](references/images/mobile-dfl-2026-p34-post-comments.png) | Like/comment presentation |
| 35 | [Share](references/images/mobile-dfl-2026-p35-share.png) | Share-sheet hierarchy; sharing beyond the local demo is out of scope |

## Conflict rules for Astra

1. **Desktop shell and Home:** follow the 2025 Home slide even when newer sources show a different tab order or no contacts rail.
2. **Profile:** follow desktop slide 8 for geometry; use the 2026 phone Profile crop to adapt the cover, avatar, actions, and stacked content.
3. **Menu and Settings:** follow Senior Planet for the desktop account-menu path and Digital for Life for the phone path. Expose only settings that this demo actually stores.
4. **Friends and Marketplace:** use the supplementary UI screenshots for layout and Meta announcements for broad behavior. Do not import old blue-header styling, ads, AI tools, checkout, or account-specific copy.
5. **Responsive navigation:** source screenshots disagree about top versus bottom tab placement and exact tab count. The demo's [mobile navigation contract](VISUAL_SPEC.md#mobile-390--844-target) wins; keep it stable across every route.

The screenshots are reference material. They contain third-party images and real people; keep them under `docs/references` and create separate fictional, locally bundled runtime media. No Facebook account access is required to use this pack.
