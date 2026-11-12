# Facebook clone — web and native iOS

**Unofficial hackathon demo; not affiliated with or endorsed by Meta or Facebook.**

A responsive website and native React Native iPhone app built with Expo, TypeScript and Expo Router. Both start as fictional Maya Chen with the same local content. There is no Facebook login, backend, remote feed, payment or external message delivery.

## Run the website

Use Node.js 24 LTS or later and npm. From this folder:

```sh
npm ci
npm run web
```

Open the URL printed by Expo. For a fixed local port: `npm run web -- --port 8081`.

## Run on iPhone

Install Expo Go on your iPhone. This project uses **Expo SDK 57**; verify that your Expo Go release supports SDK 57 before opening the project. Keep the phone and development computer on the same network, run `npm start`, and scan the QR code. Current physical iOS Expo Go requires the CLI and phone to use the same Expo account; sign in yourself through `npx expo login` and the Expo Go app. The clone does not collect those credentials.

Expo Go runs the actual React Native screens. It needs the development server for initial loading; it is not a standalone installed build. The application’s content and actions run locally after loading. Browser state and iPhone state are independent.

If full Xcode is installed later, `npm run ios` opens an iOS Simulator. This machine currently has command-line tools only. Actual iPhone screenshots, gestures, photo permissions and keyboard positioning remain separate device checks; a bundle export does not verify them.

## What works

- Home, Profile, Friends, Marketplace and Settings, plus all visible secondary destinations.
- Text/photo posts, stories, seven reactions, comments, saved posts and profile edits.
- Grouped local search, friend-request decisions, notification preferences/read state and Messenger conversations.
- Listing filters/details, saved listings and local seller messages.
- Light/Dark, feed ordering, default/per-post audience and scoped reset.

The seed contains 24 posts (including six by Maya), eight stories, eight contacts, four requests, six notifications, 16 listings, three conversations, four events and three groups. Home has a finite scrollable feed with a Back to top action; stories scroll horizontally. Images are bundled locally, with sources in [the media ledger](assets/provenance.md). Reference screenshots remain under `docs/references` and are not used as feed content.

## Reset and storage

Go to **Menu/account → Settings & privacy → Settings → Reset demo**, then confirm. This removes only `facebook-clone-demo:v1` and native photos owned by this demo. Other projects’ storage stays intact. Browser storage is localStorage; iPhone storage is AsyncStorage and app document files. Unreadable saved data is preserved until an explicit reset; the app reports save/storage errors rather than hiding them.

Photo selection accepts one image up to 10 MB, compresses it to at most 1280 pixels on its long edge, and bounds browser photo data. This is a small local demo, not an unlimited photo library.

## Add your own features

Start with [architecture and shared interfaces](docs/ARCHITECTURE.md), then [the feature/subapp guide](docs/EXTENDING.md). Modules contribute routes, menu entries, Home sections, composer actions and post actions through the typed static registry. They share the account, theme and local state. Platform-specific screen files keep the desktop browser and native phone layouts independent.

[Reference documentation and original page prompts](docs/README.md) remain the visual/behavior contract. [Verification evidence](docs/verification/README.md) records actual checks, screenshots and remaining limitations. [Dependency notes](docs/DEPENDENCIES.md) explain the SDK 57 URI-decoder mitigation and unresolved upstream audit entries.

Run `npm run format` after changing source files.

## Checks and exports

```sh
npm test
npm run test:native
npm run typecheck
npm run lint
npm run test:e2e
npx expo install --check
npx expo-doctor
npm run build:web
npm run build:ios
```

Browser tests use installed Google Chrome (`channel: 'chrome'`) and start Expo on port 8081 if needed. They save screenshots under `docs/verification/web`. Set `PLAYWRIGHT_BASE_URL` to test an already-running production preview; [exact preview commands](docs/verification/README.md#reproduce-the-production-browser-check) include the required SPA routing fallback. Native component tests run in Jest; native runtime checks still require a phone or simulator.

`build:web` writes `dist/`, a static single-page website. Serve it with an index.html fallback for deep links. `build:ios` writes the JavaScript/Hermes bundle and assets to `dist-ios/`; it does not create a signed IPA. Android acceptance, backend services and store distribution are deferred.
