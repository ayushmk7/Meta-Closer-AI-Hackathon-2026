# Astra prompt: secondary views and route completeness

> Accepted implementation scope: responsive web + native iOS through Expo Go. Android testing/distribution is deferred. See [architecture and extension contract](../ARCHITECTURE.md).


After Home, Profile, Friends, Marketplace, and Settings exist on web and native, make **every visible navigation item** open a populated local demo view or panel on its platform. Read the navigation map in `docs/CONTENT_AND_INTERACTIONS.md` and inspect all controls rendered by both shells and page agents. Use existing seeded content and card styles. This is a route-completeness pass, not a request for full Facebook subsystems.

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

Use stable route identifiers, direct-refresh-safe web navigation, and native Back/close behavior. The Facebook mark/Home returns to the fixed Home feed; the account/avatar opens Profile; phone Menu exposes destinations hidden from desktop rails. If a visible control has no supported demo behavior, remove it from the UI instead of leaving a dead affordance. For any local explanatory panel, label it clearly as a demo and give it a back/close action. Do not create authentication, payments, external sharing, or new random content.

## Completion check

Walk every visible header tab, desktop rail row, phone-web/native bottom item, Menu tile, Profile tab, post menu action, search result, notification target, and contact row. Verify nonempty destinations or intentional empty states, active route indication, browser back/forward/direct refresh, and native Back/close. Repair any broken seeded ID/image link at its source in the single seed file and native/web asset mapping.
