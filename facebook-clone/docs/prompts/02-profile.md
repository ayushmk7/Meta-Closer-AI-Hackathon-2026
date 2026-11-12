# Astra prompt: Profile

Implement the signed-in demo account's **Profile** using the shared header, local seed, and Home post-card grammar. Read the build brief, content contract, visual spec, and source atlas. Inspect existing Profile route and shared post components before editing.

## References to inspect

Use [desktop Profile slide 8 UI](../references/images/desktop-profile-ui.png) as the primary layout target. [Senior Planet page 1](../references/images/profile-walkthrough-page-01.png) shows profile entry; [page 2](../references/images/profile-view-as-page-02.png) shows the overflow/View As context. Use the [2026 phone Profile crop](../references/images/mobile-profile-2026-ui.png), [full Profile page](../references/images/mobile-dfl-2026-p22-profile.png), [edit-profile page](../references/images/mobile-dfl-2026-p23-profile-edit.png), and [friends-list page](../references/images/mobile-dfl-2026-p29-friends-list.png) to adapt the layout to a narrow viewport. These sources show real people and instructional arrows; use fictional Maya and local media.

## Desktop composition

Keep the shared white header. Below it, center a wider Profile container. Start with a wide landscape cover image. Overlap a large circular Maya avatar across the cover's lower edge. On the identity row, put Maya's name and friend count near the avatar, with primary and secondary actions aligned right. Follow with a slim tab bar: **Posts, About, Friends, Photos, More**; indicate the active tab with blue text/underline. Slide 8 includes a friend-suggestion row between the identity area and tabs; use a modest seeded row if it fits without moving the core tab/body structure far from the reference.

The body is a narrower left Intro area and wider right post area. Intro contains fictional bio/location details and a compact friends/photo preview from local seed data. The right side begins with Maya's composer and shows her authored posts, including user-created posts; reuse Home's exact post-card behavior and audience badges. Maintain the reference's white card surfaces on `#F0F2F5` canvas and the same spacing rhythm as Home.

## Mobile composition

At 390 × 844, the cover spans the content width and the avatar overlaps it visibly. Stack name, friend count, and actions beneath it. The tabs scroll horizontally or fit as a compact row without clipping. Put Intro, Friends/Photos previews, composer, then posts in one column. The 2026 phone capture shows a large avatar, action buttons, and suggestions; carry those proportions into the responsive web design, while retaining the shared bottom navigation and safe-area spacing. Photo tiles use stable local images and crop predictably.

## Tab and action behavior

Posts displays Maya's seeded and new posts. About shows her fictional profile fields. Friends shows confirmed seeded/requested friends and a link to the main Friends page. Photos shows only bundled/user-added photos. More opens a small menu of supported local subsections. If a visible Edit profile action is included, it must work locally for a minimal bio/cover/avatar edit or open a clearly labeled local demo editor; no dead button. The overflow menu may offer View As: show a local read-only public preview derived from each post's selected audience, with a clear return to Maya's Profile. Do not expose unsupported audience choices as working controls.

## Completion check

Capture Profile at **1440 × 900** and **390 × 844**. Compare cover height, avatar overlap, identity/action alignment, tab placement, Intro/post column ratio, and phone stacking. Verify every tab opens meaningful content, a new Maya post appears on Profile after refresh, confirmed friends appear in the Friends subsection, and no action opens Facebook or asks for credentials.
