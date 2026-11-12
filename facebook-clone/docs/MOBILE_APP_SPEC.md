# Native mobile app specification

> Accepted implementation scope: responsive web + native iOS through Expo Go. Android testing/distribution is deferred. See [architecture and extension contract](ARCHITECTURE.md).


This document adds a **real iOS app** to the responsive website described in [the build plan](ASTRA_PLAN.md). A phone-sized browser is still required for the web deliverable, but it does not count as the native app. The app is a private, pre-signed-in, offline demo of fictional Maya Chen; it needs no Facebook account, backend, or Facebook API.

## Implementation boundary

Use an Expo + React Native + TypeScript project that targets **web and iOS**. Expo's [project guide](https://docs.expo.dev/get-started/create-a-project/) and [universal tutorial](https://docs.expo.dev/tutorial/introduction/) support this starting point. Share one deterministic seed file, stable IDs, content selectors, reaction/request/settings rules, and validation across platforms. Use platform-specific view components where the desktop web shell and native phone shell differ; React Native documents [platform-specific files and `Platform` handling](https://reactnative.dev/docs/platform-specific-code/). Avoid duplicating seed content in a second mobile file.

The suggested project shape is one app with `src/data/seed.ts`, shared state/domain code, web-specific storage/layout files, and native storage/layout files. Do not force the desktop Home page into native phone geometry or try to use CSS-only DOM views inside the native runtime. [Expo Router](https://docs.expo.dev/router/introduction/) is a sensible navigation default for a new Expo project; inspect the actual scaffold before adding anything.

## Native page map

The **same five primary views and local interactions** exist in the website and native app. The phone captures below are the visual references; the [source atlas](SOURCE_ATLAS.md) gives page numbers and limitations. Use the same blue, gray, white, dark, text, and divider tokens as the website. System fonts may render differently on iOS; tune size and weight by screenshots rather than hardcoding source pixels.

| Native screen | Layout at portrait phone width | Reference and working result |
| --- | --- | --- |
| **Home** | Top brand/search/Messenger controls, compact composer, horizontally scrolling stories, one-column post feed, bottom tabs. Keep text and image cards edge-aligned; first fixed post remains Amina's photo. | [Phone Home](references/images/mobile-home-2026-ui.png), [older feed card](references/images/mobile-feed-ui.png), [story](references/images/mobile-dfl-2026-p14-stories-view.png), [composer](references/images/mobile-dfl-2026-p32-composer.png). Post, react, comment, save, story open, and search all work locally. |
| **Profile** | Cover image, overlapping avatar, Maya's name/friend count, action buttons, horizontally scrollable tabs, then Intro/Friends/Photos and authored posts stacked. | [Phone Profile](references/images/mobile-profile-2026-ui.png), [edit details](references/images/mobile-dfl-2026-p23-profile-edit.png). Posts/About/Friends/Photos/More open real local sections; new Maya posts appear here. |
| **Friends** | Title and section chips, request count, readable vertical cards/rows with avatar, mutual-friend count, Confirm/Delete, then suggestions and friends-only activity. | [Phone Friends](references/images/mobile-friends-2026-ui.png), [find friends](references/images/mobile-dfl-2026-p28-find-friends.png). Request decisions persist and update Profile/All Friends. |
| **Marketplace** | Title/search, compact For you/Local/Saved controls, two-column image-first grid, native detail screen with seller and Message seller. | [App Store Marketplace UI](references/images/mobile-marketplace-2026-ui.png). Search/filter/listing/save/message work with 16 local listings; no payment or remote seller. |
| **Settings** | Menu tiles lead through Settings & privacy; grouped Preferences, Notifications, Feed preferences, Audience and visibility, Display & accessibility, and Reset demo screens. Show active values before tap. | [Phone Menu](references/images/mobile-menu-2026-ui.png), [Settings groups](references/images/mobile-settings-2026-ui.png). Theme, notification filters, feed order, audience, and reset persist locally. |

Use one stable bottom-tab order on native iOS: **Home, Friends, Marketplace, Notifications, Menu**. Profile is available through the Home avatar and Menu. Messenger remains accessible from the top controls and contacts. The source screenshots show different tab counts/positions because they depict different releases; the demo's consistent tab contract wins. Secondary destinations from [the navigation map](CONTENT_AND_INTERACTIONS.md#navigation-map) open small populated native screens or sheets, not browser links.

## Navigation and native interaction

The bottom tabs stay visible on the five **top-level tab destinations**: Home, Friends, Marketplace, Notifications, and Menu. Profile and Settings open from those tabs as stack screens with a clear back action; they may hide the tab bar while open. Detail screens (post, listing, chat, story, search results, settings subsection) use a stack or sheet with a clear close/back action. iOS back gestures must return to the previous screen or close an open sheet before leaving the current flow. Handle status-bar/notch and home-indicator safe areas so tabs, composer submit, chat input, photo picker result, and Settings reset never sit under system UI. Scroll position and tab selection should remain sensible when returning from a detail view.

Use native press/tap controls with accessibility labels and adequate touch targets. A reaction picker must work by tap, not hover. The keyboard must not cover comment, search, or chat submit fields. Menus and dialogs must announce their purpose to assistive technology; visible state changes should be understandable without color alone. Respect reduced-motion settings where animation is used.

## Seed, storage, and local photos

The initial mobile feed, people, stories, requests, notifications, listings, chats, fixed display times, and default settings are **identical to the web seed**. Each installation stores its own changes; no cross-device sync is required. On web, use namespaced `localStorage` as the [content contract](CONTENT_AND_INTERACTIONS.md) specifies. On native, use a namespaced persistent key-value store such as [Async Storage](https://docs.expo.dev/develop/user-interface/store-data/) for the same versioned JSON overlay. It is unencrypted and appropriate only for this fictional demo state. Validate malformed data and show a local save error instead of silently dropping changes. Native Reset demo removes only this demo's key and its own user-photo files, then restores the seed/default Light theme.

Bundled seed media must be local app assets; avoid dynamic network image URLs. For a user-added photo, use [Expo ImagePicker](https://docs.expo.dev/versions/latest/sdk/imagepicker/) to select an image from the library, optionally resize/compress with [ImageManipulator](https://docs.expo.dev/versions/latest/sdk/imagemanipulator/), and store the resulting file under the app's persistent [FileSystem document path](https://docs.expo.dev/versions/latest/sdk/filesystem/). Persist only its local URI and metadata in the state overlay. A picker cancellation leaves the draft intact; a failed copy/save shows an error. Do not store large base64 photos in native key-value storage. The native demo does not need camera capture or permission; a Photo/video control may select existing local images only.

## Visual and build evidence

Run the **native runtime**, not only the web browser. Capture Home, Profile, Friends, Marketplace, and Settings from an iOS simulator/device around **390 × 844 points** . Status bars, system font rendering, and safe areas may differ; compare the app content and document justified platform differences. Also capture one native account/Menu path, notifications, and a chat/composer state. Save screenshots under `docs/verification/native-ios/`.

On both platforms, smoke-test: posting text/photo; reaction/comment/save; search; Confirm/Delete request; notification read; send message; listing detail/message; Light/Dark, notification preferences, feed order, audience; refresh/relaunch persistence; Reset demo. Turn off network after app assets are loaded or use a packaged development build to verify the demo makes no runtime API/image requests. Run the project's TypeScript/build checks and launch the app on iOS. A web-only build or mobile viewport screenshot is insufficient evidence for this native deliverable. Add exact run/build commands and any simulator/device limitation to the final `docs/verification/README.md`.

This is a private demo specification. App-store submission, signed release distribution, real Facebook login, remote messaging, payment, and live marketplace transactions are outside the requested experience.
