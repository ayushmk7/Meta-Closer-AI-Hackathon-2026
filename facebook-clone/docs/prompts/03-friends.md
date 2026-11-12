# Astra prompt: Friends

> Accepted implementation scope: responsive web + native iOS through Expo Go. Android testing/distribution is deferred. See [architecture and extension contract](../ARCHITECTURE.md).


Implement **Friends** as populated desktop web, phone web, and native iOS views. Read the build brief, source atlas, visual spec, native app spec, and content contract. Reuse the shared person IDs and request rules; inspect existing request/state handling before editing.

## References to inspect

The [desktop Friends screenshot](../references/images/desktop-friends-guidingtech.png) shows a left section menu and friend-request cards. The [2026 phone Friends crop](../references/images/mobile-friends-2026-ui.png) and [full request page](../references/images/mobile-dfl-2026-p30-friend-requests.png) show compact request rows, mutual-friend counts, and Confirm/Delete buttons. [Find friends](../references/images/mobile-dfl-2026-p28-find-friends.png) and [friends list](../references/images/mobile-dfl-2026-p29-friends-list.png) show search and confirmed-friend patterns. [Meta's March 2025 Friends update](https://about.fb.com/news/2025/03/bringing-magic-of-friends-back-to-facebook/) says the tab also brings together friends' content. The desktop screenshot is from 2024; carry over structure, but use the Home slide's newer shared header, tokens, and spacing.

## Desktop layout

Below the shared header, place a left Friends section rail with a strong **Friends** title and clear subsections: Home, Friend Requests, Suggestions, All Friends, Birthdays. Each visible subsection switches to real local content. The main area starts with **Friend Requests** and four seeded pending people. Use image-led cards or a responsive grid: avatar/photo, name, mutual-friend detail, blue Confirm, neutral Delete. Follow with **People you may know** cards and a compact friends-only activity area drawn from existing seeded posts/stories. This preserves the demonstrated request workflow while acknowledging the newer Friends tab. Keep white surfaces, page gray, type sizes, icons, and blue active state consistent with the shared desktop shell.

## Mobile layout

At 390 × 844 in phone web and in the native app, remove the desktop section rail and show a page title, small section chips/tabs, a vertically readable request list, then suggestions/friend content. The 2026 screenshot shows the Friend Requests heading, count, See All, circular avatars, mutual-friend text, and side-by-side Confirm/Delete actions. Adapt those relationships without copying the real names or dated counts. Keep the persistent demo bottom tabs clear of the last action row. The Friends tab is visibly active.

## Native app implementation

Use native touch controls for request cards and section chips, with friend profiles as local stack screens. Confirm/Delete must update the same shared request overlay rules as web and remain changed after app relaunch. Android Back and iOS back gestures return from a profile to the Friends list without resetting its selected section.

## Local behavior

Confirm and Delete act on the correct request ID, update the card immediately, and persist. Confirmed people appear in All Friends, Profile's Friends subsection, search, and any relevant local contact list; deleted requests disappear from pending requests without changing unrelated people. Show a useful empty state after all requests are handled. Suggestions can open fictional local profiles; an Add Friend action, if shown, must change to Requested or otherwise visibly register locally. Friends-only posts can reuse the Home post card in a filtered list. Birthday cards can use fixed seed dates/labels without computing changing real-time ages or inventing new users.

## Completion check

Capture Friends at desktop web, **390 × 844** phone web, and native iOS. Compare desktop side-menu/main-area split and phone request density against the references. Confirm one request, delete another, refresh/relaunch, and verify counts and destinations on each platform. Check all section chips/rail links, empty states, and keyboard/touch request operation.
