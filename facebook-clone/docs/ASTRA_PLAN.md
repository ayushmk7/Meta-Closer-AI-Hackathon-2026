# Astra build brief and implementation plan

## Objective and current status

Build a high-fidelity, responsive, **offline personal-account Facebook clone** for a private hackathon demo. This plan is the handoff for the implementation phase; **the application has not been started**. The only existing project content at this point is documentation and the local reference pack. The finished experience must open directly as fictional Maya Chen, require no credentials, make no API calls, and show the same seed whenever its local demo state is fresh or reset.

Read [References](REFERENCES.md), [Source atlas](SOURCE_ATLAS.md), [Visual specification](VISUAL_SPEC.md), [Content and interactions](CONTENT_AND_INTERACTIONS.md), and [page prompts](prompts/README.md) before coding. The screenshot priority is desktop Home slide 5, desktop Profile slide 8, the Senior Planet menu/Settings handout, then the 2026 Digital for Life mobile guide. Mobile slide 41 is a secondary feed example. Meta brand guidance controls the logo, and Meta's Feed article informs newer behavior where the guides differ.

## Scope and smallest complete implementation

Required primary views: Home, Profile, Friends, Marketplace, Settings. Required shared surfaces: top navigation, left sidebar, right contacts sidebar, stories, composer, feed cards, account menu, notifications, Messenger. All visible navigation must open a populated local demo view; use simple reuse of the seed for secondary destinations rather than making full Facebook products. Implement all requested local actions and persistence. Do not add authentication, backend services, live video, real Marketplace transactions, external messaging, analytics, ads, random posts, or infinite-feed generation.

Since the clone folder has no app scaffold, a small Vite + React + TypeScript app with one stylesheet is a reasonable starting point. Use the browser's `localStorage` and hash routes or an equally small history-aware route mechanism; no state-management or router dependency is required for this demo. Keep seed data in one file and runtime media local. Preserve any structure already present if this folder changes before implementation starts.

## Web and mobile delivery contract

Implement **one responsive website**. “Mobile” means the website at phone width, informed by the mobile-app screenshots in this pack; it is not a separate native iOS/Android build. Use the same routes, seed, actions, and localStorage state on desktop and phone layouts. At phone width, redesign navigation and stacking for touch rather than shrinking the desktop columns.

| Target | Required views | Layout and check |
| --- | --- | --- |
| Desktop browser, **1440 × 900** | Home, Profile, Friends, Marketplace, Settings | Home uses three columns; Profile uses cover plus two-column body; Friends and Marketplace use their own section rails; Settings has category rail plus detail panel. Capture all five. |
| Phone browser, **390 × 844** | Home, Profile, Friends, Marketplace, Settings | One content column, persistent bottom navigation, no desktop sidebars, no horizontal overflow. Profile and Settings stack; Marketplace uses two listing columns within the single page column. Capture all five. |
| Tablet-width smoke check, around **820 × 1180** | All five routes | Drop a rail before it crowds content; keep main actions and navigation reachable. A visual smoke check is enough unless a concrete issue appears. |

Check pointer and keyboard interactions on desktop and tap/scroll behavior at phone width. Account, notification, Messenger, composer, and listing-detail surfaces must fit the viewport at both sizes and preserve navigation/back behavior. Browser chrome and native status bars in the references are not part of the web app.

## Work sequence

| Stage | Deliverable | Completion check |
| --- | --- | --- |
| 1. Scaffold and assets | Runnable app, root README with unofficial-demo notice, local images for all seeded people/posts/stories/listings, source/provenance note for app media | App opens offline with no external image requests and no credential prompt |
| 2. Seed and state | One deterministic seed file; small localStorage overlay with validation/fallback; reset behavior | Fresh state has the exact inventory in [Content and interactions](CONTENT_AND_INTERACTIONS.md); refresh and reset work |
| 3. Shared shell and Home | Responsive header/rails/mobile nav; composer, stories, post cards, contacts | 1440 × 900 Home matches slide 5's proportions and first-fold composition; 390 × 844 has one column and no overflow |
| 4. Primary pages and secondary routes | Profile, Friends, Marketplace, Settings; simple local views for every other visible destination | Every nav item works, direct refresh and back/forward work |
| 5. Local interactions | Posting, reactions, comments, save, search, requests, notifications, Messenger, theme, feed order, audiences | Each action changes visible state and persists as specified |
| 6. Visual QA and release check | Captures at both required viewport sizes; fixes for visible mismatches; build check; short remaining-differences list | Acceptance checks below pass, with any residual differences documented |

Suggested parallel ownership after stage 2 is stable: one agent owns shared shell/Home/Profile styling, one owns the data/state and interaction contract, one owns secondary views/Settings. Integrate through shared types and routes, then assign one agent to final screenshot comparison. Avoid simultaneous edits to the seed or central app entrypoint. This is a proposed handoff, not authorization to start agent execution during the documentation phase.

## File and integration reach

The eventual change reaches the app entrypoint and route dispatch, shared layout, seeded data, local media, state/persistence logic, CSS/theme tokens, all pages and popovers, app README, and a small state/interaction check. Every seeded image path and every navigation target must resolve. A change to person IDs affects posts, stories, contacts, requests, notifications, search, and chats; keep those references consistent in the single seed file. Reset must remove only the clone's namespaced key. The main user risks are lost user-created demo data on a bad save/reset, misleading nonworking controls, unwanted external requests, and poor mobile access to hidden desktop destinations; verify each explicitly.

## Acceptance checklist

### Visual

- [ ] Capture **all five primary views** at **1440 × 900** and **390 × 844**; compare against the local page references for header, rail/feed widths, card alignment, image crops, type, and colors.
- [ ] At **390 × 844**, confirm single-column page layout, reachable bottom navigation, touch targets, and no horizontal overflow. At around **820 × 1180**, smoke-check all five routes for rail overlap and reachable actions.
- [ ] Capture desktop Settings, account menu, notifications popover, and Messenger drawer; compare account nesting and menu placement with the Senior Planet handout.
- [ ] Fix visible mismatches, recapture, and list any remaining differences in the final handoff.

### Functional

- [ ] Fresh run always has at least seven specified posts (including text, single-photo, multi-photo, shared-link), five stories, eight contacts, four requests, six notifications, six listings, and three conversations.
- [ ] Post text/photo, react, comment, save, search, confirm/delete a request, read notifications, and send a message; refresh after each group of actions and verify state remains.
- [ ] Change theme, notification categories, feed order, and default/individual post audience; active labels update immediately and remain after refresh.
- [ ] Reset demo after changes; verify the exact seed view and initial settings return, while other origin storage is untouched.
- [ ] All visible header, rail, bottom-nav, menu, notification-target, and search-result destinations lead somewhere useful locally. Check back/forward and direct refresh.
- [ ] No Facebook sign-in, credential form, API call, external image hotlink, or random content. Any local file/photo failure produces a clear message.

### Build and accessibility

- [ ] Run the project's build check and any existing tests. Add one focused check for seed completeness and state restore/reset if the implementation introduces nontrivial persistence logic.
- [ ] Check keyboard operation of menus, dialogs, reactions, and composer; icon-button labels; visible focus; dark-mode contrast; meaningful image alt text; and reduced-motion behavior.
- [ ] The root README states **“Unofficial hackathon demo; not affiliated with or endorsed by Meta or Facebook.”** and explains how to run/reset the local app.

## Evidence to leave for the next reviewer

Keep final screenshots in `docs/verification/` with viewport sizes in their file names, and a short `docs/verification/README.md` recording the build command/result, interaction checks, and remaining visual differences. These are implementation-phase artifacts; do not claim them complete from this documentation-only handoff.
