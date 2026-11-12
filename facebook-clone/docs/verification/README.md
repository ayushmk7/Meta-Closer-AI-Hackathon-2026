# Implementation verification — 12 November 2026

Responsive web and native iOS implementations are present. **All automated checks below passed. Actual iPhone runtime verification is still pending** because this environment has no full Xcode/simulator or accessible iPhone. The iOS export is a Hermes bundle, not a signed app or native screenshot.

## Commands and results

Run from `facebook-clone/`. Environment: macOS, Node 26.13.0, npm 11.20.0, Expo 57.0.32, React Native 0.86.3. Browser checks use installed Google Chrome through Playwright.

| Command/check | Actual result |
| --- | --- |
| `npm test` | **21 passed**: expanded seed inventory/references, old overlay compatibility, frozen media hashes, state actions/selectors, settings, search, schema validation, failed hydration, serialized persistence/reset, media references, feature registration, URI decoder compatibility/stress/resolver isolation |
| `npm run test:native` | **8 passed** across three Jest suites: finite-feed rendering/Back to top without scroll resets, accessible control state, section selection, request navigation/Confirm ID, unknown profile, confirmed suggestions, read-only public preview |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npx expo install --check` | Dependencies compatible with SDK 57 |
| `npx expo-doctor` | **21/21 checks passed** |
| `npm run test:e2e` | **11 browser journeys passed** against the production export in 14.3 seconds; no external API/image requests or page errors in the primary-page matrix |
| `npm run build:web` | Passed: 903 modules, 69 emitted assets; 1.3 MB JS and 48 KB CSS; output `dist/` |
| `npm run build:ios` | Passed: 1,274 modules, 75 assets; 2.7 MB Hermes bundle; output `dist-ios/` |
| Static production preview | Home, Profile, Friends, Marketplace, Settings and post detail opened directly with index.html fallback; no browser runtime errors |
| Native Expo Go launch/captures | **Not performed**; see [device checklist](native-ios/README.md) |

Final bundles: web `entry-5edef0f04b2f15654644a9ff4cc4f9c7.js`; iOS `entry-c40dc16f32b151ca69f9dc1afd3b6a86.hbc`. Exported bundles are generated artifacts and ignored by Git. Browser captures below are retained.

The browser journeys exercise posting, per-post audience, reaction/comment/save, Profile propagation, Confirm/Delete, listing search/save/seller messaging, theme and feed order, notification preferences/read state, composer audience defaults, photo compression/reload/cancellation, public-preview photo filtering, scoped reset, secondary routes/unknown IDs, menu/dialog keyboard dismissal, real desktop wheel scrolling, emulated phone touch gestures, horizontal story swipes, finite-feed ending/Back to top, sticky navigation, modal backdrop scroll lock and post-menu/reaction placement at both viewport edges. Phone/tablet captures are **browser viewport emulation**, not native app screenshots or a Safari/device certification.

## Primary screenshots

All five views were captured at desktop **1440×900**, phone **390×844**, and tablet **820×1180**. The matrix checks horizontal overflow and visible route content. All 41 captures use the production web export so Expo’s development indicator does not cover the app. Phone touch tests use Chromium touch input; they do not certify iOS Safari.

| Page | Desktop | Phone browser | Tablet smoke |
| --- | --- | --- | --- |
| Home | [1440×900](web/home-1440x900.png) | [390×844](web/home-390x844.png) | [820×1180](web/home-820x1180.png) |
| Profile | [1440×900](web/profile-1440x900.png) | [390×844](web/profile-390x844.png) | [820×1180](web/profile-820x1180.png) |
| Friends | [1440×900](web/friends-1440x900.png) | [390×844](web/friends-390x844.png) | [820×1180](web/friends-820x1180.png) |
| Marketplace | [1440×900](web/marketplace-1440x900.png) | [390×844](web/marketplace-390x844.png) | [820×1180](web/marketplace-820x1180.png) |
| Settings | [1440×900](web/settings-1440x900.png) | [390×844](web/settings-390x844.png) | [820×1180](web/settings-820x1180.png) |

Additional evidence: [account menu](web/account-1440x900.png), [Settings submenu](web/account-settings-1440x900.png), [desktop notifications](web/notifications-1440x900.png), [desktop Messenger](web/messenger-1440x900.png), [desktop composer](web/composer-1440x900.png), [dark Home](web/home-dark-1440x900.png), [phone Menu](web/menu-390x844.png), [phone notifications](web/notifications-390x844.png), [phone Messenger](web/messenger-390x844.png), [phone composer](web/composer-390x844.png), and [phone dark Settings](web/settings-dark-390x844.png).

## Scrolling and icon follow-up

The local inventory now contains **24 posts, eight stories, 16 listings, four events and three groups**, with six authored posts on Maya’s Profile. The first seven posts, first five stories and first six listings remain unchanged. The version-one overlay, saved changes, request decisions, notification/chat inventories and storage key are preserved. Twenty-two additional frozen local photographs bring the stock-photo pack to 49 images (about 5.5 MB); provenance and SHA-256 hashes are verified by tests.

Expo’s default `body { overflow: hidden }` blocked real wheel scrolling even though content extended below the viewport. The web document now scrolls normally; open dialogs lock their backdrop. The viewport suppresses elastic overscroll at the finite-feed boundary so the sticky header and rails stay visually anchored. Post menus flip upward near the bottom, and reaction pickers flip below their controls near the sticky header. Web and native feeds have a finite ending and Back to top action. Native updates retain stable post components and unsent comment drafts.

The previous web Settings path was asymmetric and outlined. It now uses a balanced filled cog with a transparent center inside the existing gray circle, compared directly against the [account-menu reference](../references/images/account-menu-ui.png). Native Menu and its Settings entry both use the bundled filled gear. This is a close visual match, not a claim to use Facebook’s proprietary icon file.

| Evidence | Desktop | Phone browser |
| --- | --- | --- |
| Scrolled Home | [1440×900](web/home-scrolled-1440x900.png) | [390×844](web/home-scrolled-390x844.png) |
| Scrolled Profile | [1440×900](web/profile-scrolled-1440x900.png) | [390×844](web/profile-scrolled-390x844.png) |
| Scrolled Marketplace | [1440×900](web/marketplace-scrolled-1440x900.png) | [390×844](web/marketplace-scrolled-390x844.png) |
| Settings lower controls | [1440×900](web/settings-scrolled-1440x900.png) | [390×844](web/settings-scrolled-390x844.png) |
| Post menu at lower edge | [1440×900](web/post-menu-edge-1440x900.png) | [390×844](web/post-menu-edge-390x844.png) |
| Reactions below header | [1440×900](web/reaction-edge-1440x900.png) | [390×844](web/reaction-edge-390x844.png) |

Also inspect the [finite-feed ending](web/home-end-1440x900.png), [horizontally scrolled stories](web/stories-scrolled-390x844.png), and [Settings icon detail](web/settings-icon-detail.png).

### Reproduce the production browser check

Run `npm run build:web`. Serve `dist/` on a loopback port with an `index.html` fallback for browser page routes. `npx expo serve` in the installed SDK serves files but did not provide this fallback, so direct `/profile` and other deep links returned 404 in the first preview attempt. The successful check used this dependency-free local server from the project root:

```sh
python3 -u <<'PYTHON'
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

class Preview(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory='dist', **kwargs)
    def do_GET(self):
        if 'text/html' in self.headers.get('Accept', '') and not Path(self.translate_path(self.path)).is_file():
            self.path = '/index.html'
        super().do_GET()

ThreadingHTTPServer(('127.0.0.1', 8082), Preview).serve_forever()
PYTHON
```

In a second terminal run `PLAYWRIGHT_BASE_URL=http://127.0.0.1:8082 npm run test:e2e`. The default `npm run test:e2e` still starts/reuses the Expo development server on port 8081. Production hosting needs the same SPA fallback; this preview is not a deployment.

## Visual comparison and remaining differences

Compared the rendered views with the local reference crops in [the reference pack](../REFERENCES.md). Desktop Home was tightened after the first pass: composer height reduced from about 124 px to 110 px, stories from about 190 px to 178 px, and rail rows to 48 px. The active Home icon is filled; every platform uses the downloaded complete official circular logo.

Measured desktop Home at 1440×900: header **56 px**, cards **600 px** wide at **x=420**, composer starts at **y=70**, stories at **y≈192**, first post at **y≈382**. The layout shell reserves 316 px per rail including padding. These proportions follow the scaled reference's roughly 41% center feed; the low-resolution source includes browser chrome and cannot provide exact CSS measurements.

Remaining intentional or unverified differences:

- Fictional people, reusable local photos and fixed demo prose replace reference-account content. Crops and text lengths therefore differ.
- Icons are a consistent hand-authored web set and bundled Ionicons on native; they are not Facebook's proprietary icon assets. System fonts replace Facebook Sans.
- Phone navigation uses the agreed five bottom destinations. The official circle replaces the wordmark in some phone references; this follows the reference pack's brand-authority rule.
- Settings includes only the functional local controls requested; its shorter grouped layout differs from the full reference account's settings inventory. Native font metrics, safe areas, keyboard behavior and final pixel alignment require an actual iPhone pass.

## Storage, security and limitations

Failed hydration does not overwrite unreadable saved data: the session stays usable without persistence until explicit successful reset. Failed reset rejects without navigating away. Native photo reconciliation only removes abandoned files from the demo-owned directory after valid hydration; missing owned photos get a local placeholder and visible message.

Expo SDK 57 retains upstream dependency advisories. A tested Metro resolver mitigation replaces the vulnerable URI decoder in web/native app bundles. **The dependency tree is not audit-clean**; the installed package and build-tool findings remain recorded in [dependency notes](../DEPENDENCIES.md). No forced SDK or incompatible dependency upgrade was used.

No live Facebook data, credentials, backend APIs, remote image hotlinks, real seller messages, payments, broadcasts or generated infinite feed are present. No deployment, App Store submission or Android acceptance was performed.
