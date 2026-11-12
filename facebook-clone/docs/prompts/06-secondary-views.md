# Astra prompt: secondary views and route completeness

After Home, Profile, Friends, Marketplace, and Settings exist, make **every visible navigation item** open a populated local demo view or panel. Read the navigation map in `docs/CONTENT_AND_INTERACTIONS.md` and inspect all controls rendered by the shared shell and page agents. Use existing seeded content and card styles. This is a route-completeness pass, not a request for full Facebook subsystems.

## Required destinations

| Visible destination | Smallest useful local view |
| --- | --- |
| Video | Local media gallery or video-style cards using bundled images/metadata; no streaming or camera permission |
| Groups | One or two fictional group cards and related seeded posts/people |
| Memories | A filtered, fixed subset of seeded posts with a clear heading |
| Saved | Saved post cards and an initial empty state; Marketplace saved listings remain identifiable |
| Feeds | The same posts with the active Feed-preferences order and visible mode label |
| Events | Fixed local event cards connected to seeded people/posts |
| Profile: About, Friends, Photos, More | Populated subsections or a local More menu; posts remain on Posts |
| Search result | Open the matching person, story, post, listing, or event inside the demo |
| Notification item | Open its referenced local post, request, chat, or listing after marking it read |
| Contact / Messenger | Open the matching local conversation |
| Privacy Checkup | A small local explainer with links to working audience and notification settings |

Use stable route identifiers and direct-refresh-safe navigation. The Facebook mark/Home returns to the fixed Home feed; the account/avatar opens Profile; the mobile Menu exposes hidden desktop destinations. If a visible control has no supported demo behavior, remove it from the UI instead of leaving a dead affordance. For any local explanatory panel, label it clearly as a demo and give it a back/close action. Do not create authentication, payments, external sharing, or new random content.

## Completion check

Walk every visible header tab, desktop rail row, mobile bottom item, Menu tile, Profile tab, post menu action, search result, notification target, and contact row at desktop and phone widths. Verify nonempty destinations or intentional empty states, active route indication, back/forward, and direct refresh. Repair any broken seeded ID/image link at its source in the single seed file.
