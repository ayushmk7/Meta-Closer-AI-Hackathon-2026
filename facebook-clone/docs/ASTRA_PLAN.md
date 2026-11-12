# Astra build brief and implementation plan

> Accepted implementation scope: responsive web + native iOS through Expo Go. Android testing/distribution is deferred. See [architecture and extension contract](ARCHITECTURE.md).


## Objective and current status

Build a high-fidelity, **offline personal-account Facebook clone for responsive web and native iOS** for a private hackathon demo. This plan is the handoff for the implementation phase; **implementation is underway**. Implementation now includes the shared core, responsive web views and native iOS views; verification status is recorded separately. Both apps must open directly as fictional Maya Chen, require no credentials, make no API calls, and show the same seed whenever their local demo state is fresh or reset.

Read [References](REFERENCES.md), [Source atlas](SOURCE_ATLAS.md), [Visual specification](VISUAL_SPEC.md), [Mobile app specification](MOBILE_APP_SPEC.md), [Content and interactions](CONTENT_AND_INTERACTIONS.md), and [page prompts](prompts/README.md) before coding. The screenshot priority is desktop Home slide 5, desktop Profile slide 8, the Senior Planet menu/Settings handout, then the 2026 Digital for Life mobile guide. Mobile slide 41 is a secondary feed example. Meta brand guidance controls the logo, and Meta's Feed article informs newer behavior where the guides differ.

## Scope and smallest complete implementation

Both web and native mobile require Home, Profile, Friends, Marketplace, and Settings, plus stories, composer, feed cards, notifications, Messenger, search, and account/Menu navigation. The desktop website additionally has the top navigation and left/right rails; mobile web and native mobile use phone navigation. All visible navigation must open a populated local demo view; reuse the seed for secondary destinations. Implement the same requested local actions and persistence on both platforms. Do not add authentication, backend services, live video, real Marketplace transactions, external messaging, analytics, ads, random posts, or infinite-feed generation.

The implementation uses an **Expo + React Native + TypeScript universal project**: Expo supports iOS and web, and platform-specific view files can preserve the desktop screenshot's layout. Use one seed file and shared domain/state rules, with web `localStorage` and native persistent key-value storage behind a small platform adapter. Use Expo Router or another already-present navigation system; avoid adding a second router or state library without need. Keep all runtime media bundled locally. Preserve any structure already present if this folder changes before implementation starts. The [native specification](MOBILE_APP_SPEC.md) names the platform-specific details and official API references.

## Web and mobile delivery contract

Implement a **responsive website and a real native mobile app** in the same project. The website works on desktop and phone browsers. The native app runs on iOS through React Native; a browser viewport alone does not satisfy the mobile-app deliverable. Share the seed, IDs, content rules, and interaction logic. Give native navigation, storage, image handling, and system-safe areas their own platform implementations. Local state need not sync between a browser and a phone; each installation starts from the same immutable seed.

| Target | Required views | Layout and check |
| --- | --- | --- |
| Desktop browser, **1440 × 900** | Home, Profile, Friends, Marketplace, Settings | Home uses three columns; Profile uses cover plus two-column body; Friends and Marketplace use their own section rails; Settings has category rail plus detail panel. Capture all five. |
| Phone browser, **390 × 844** | Home, Profile, Friends, Marketplace, Settings | One content column, persistent bottom navigation, no desktop sidebars, no horizontal overflow. Profile and Settings stack; Marketplace uses two listing columns within the single page column. Capture all five. |
| Native iOS app, approximately **390 × 844 points** | Home, Profile, Friends, Marketplace, Settings | Run in an iOS simulator or device, capture all five from the native app, and verify safe areas, tab bar, photo picker, storage, and back/close flows. |
| Tablet-width smoke check, around **820 × 1180** | All five routes | Drop a rail before it crowds content; keep main actions and navigation reachable. A visual smoke check is enough unless a concrete issue appears. |

Check pointer and keyboard interactions on desktop and tap/scroll behavior in both phone browser and native app. Account, notification, Messenger, composer, and listing-detail surfaces must fit each viewport and preserve navigation/back behavior. Browser chrome is not part of the website; native status/safe areas are handled by the native app.

## Work sequence

| Stage | Deliverable | Completion check |
| --- | --- | --- |
| 1. Scaffold and assets | Universal web/iOS project, root README with unofficial-demo notice, local images for people/posts/stories/listings, media provenance | Web and native runtimes launch with the same seed and no credential prompt or external runtime images |
| 2. Shared seed and state | One deterministic seed file, shared domain rules, web `localStorage` adapter, native persistent-store adapter, reset behavior | Both runtimes show the inventory in [Content and interactions](CONTENT_AND_INTERACTIONS.md); refresh/relaunch and reset work |
| 3. Platform shells and Home | Desktop header/rails, phone-browser layout, native tabs/safe areas; composer, stories, cards, contacts | Desktop Home matches slide 5; phone web and native Home have one feed column and no clipped controls |
| 4. Primary pages and secondary routes | Profile, Friends, Marketplace, Settings on web and native; small local views for every other visible destination | Every nav item works; browser history and native Back/close work |
| 5. Local interactions | Posting, reactions, comments, save, search, requests, notifications, Messenger, theme, feed order, audiences | Each action changes visible state and persists on web and native |
| 6. Visual QA and release check | Web captures at desktop/phone widths, native captures on iOS, mismatch fixes, platform checks | Acceptance checks below pass, with residual differences documented |

Suggested agent ownership after the shared seed/state interface is stable: one owner for shared data/domain and storage adapters, one for desktop/phone web shell, one for native navigation/safe areas, and page owners for Home/Profile/Friends/Marketplace/Settings across both platforms. Integrate through shared IDs, routes, and tokens; then run one final cross-platform screenshot pass. Avoid simultaneous edits to the seed or central entrypoint. This is a proposed handoff, not authorization to start agent execution during the documentation phase.

## File and integration reach

The eventual change reaches web and native entrypoints/routes, platform layouts, the shared seed/domain, bundled media, storage adapters, CSS/native theme tokens, all pages and overlays, app README, and focused state checks. Every seeded image key and navigation target must resolve on all platforms. A change to person IDs affects posts, stories, contacts, requests, notifications, search, and chats; keep those references consistent in the single seed file. Reset must remove only the clone's namespaced state and owned user-photo files. The main user risks are lost demo data on a bad save/reset, broken native image mapping, misleading controls, unwanted external requests, and poor phone access to hidden desktop destinations; verify each explicitly.

## Acceptance checklist

### Visual

- [ ] Capture **all five primary views** at **1440 × 900** and **390 × 844**; compare against the local page references for header, rail/feed widths, card alignment, image crops, type, and colors.
- [ ] Capture all five primary views in an **iOS native runtime** ; compare the app content with the phone references, accounting for system bars and fonts.
- [ ] At **390 × 844**, confirm single-column page layout, reachable bottom navigation, touch targets, and no horizontal overflow. At around **820 × 1180**, smoke-check all five routes for rail overlap and reachable actions.
- [ ] Capture desktop account/Settings menu, notifications, and Messenger; capture native Menu/Settings, notifications, and a chat/composer state.
- [ ] Fix visible mismatches, recapture, and list any remaining differences in the final handoff.

### Functional

- [ ] Fresh run always has 24 specified posts (including text, single-photo, multi-photo, shared-link; six authored by Maya), eight stories, eight contacts, four requests, six notifications, 16 listings, three conversations, four events and three groups.
- [ ] On web and native, post text/photo, react, comment, save, search, confirm/delete a request, read notifications, and send a message; refresh/relaunch and verify state remains.
- [ ] On web and native, change theme, notification categories, feed order, and default/individual post audience; active labels update immediately and remain after refresh/relaunch.
- [ ] Reset demo after changes on each platform; verify the exact seed/default settings return while unrelated browser/native storage remains untouched.
- [ ] All visible header, rail, bottom-tab, menu, notification-target, and search-result destinations lead somewhere useful locally. Check browser back/forward/direct refresh and native Back/close.
- [ ] No Facebook sign-in, credential form, API call, external image hotlink, or random content. Any local file/photo failure produces a clear message.

### Build and accessibility

- [ ] Run web and native type/bundle checks and any existing tests; launch iOS in a simulator/device. Add focused checks for seed completeness and platform state restore/reset if persistence logic is nontrivial.
- [ ] Check web keyboard operation and native screen-reader labels/touch targets; visible focus where applicable, dark-mode contrast, meaningful image descriptions, and reduced-motion behavior.
- [ ] The root README states **“Unofficial hackathon demo; not affiliated with or endorsed by Meta or Facebook.”** and explains how to run/reset the website and native apps.

## Evidence to leave for the next reviewer

Keep web and native screenshots in `docs/verification/` with platform/viewport in their file names, and a short `docs/verification/README.md` recording exact run/build commands, simulator/device checks, interactions, and remaining visual differences. These are implementation-phase artifacts; do not claim them complete from this documentation-only handoff.
