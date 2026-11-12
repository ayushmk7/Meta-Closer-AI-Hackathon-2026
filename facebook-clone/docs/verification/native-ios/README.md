# Native iPhone verification — pending

Native React Native screens exist and the iOS Hermes export passes. Eight native Jest checks also pass. **No native runtime screenshots have been captured.** This folder does not contain browser captures presented as iOS evidence.

The selected demo workflow is Expo Go on a physical iPhone. Full Xcode is not installed in the current environment. The device's actual Expo Go compatibility has not been inspected: this project targets SDK 57, matching Expo's current physical-device setup guidance.

## Run and record

1. Install/open an Expo Go release supporting SDK 57. Use the same Expo account on the CLI and iPhone if required by the installed release; credentials stay with Expo's own tools.
2. Run `npm start` in `facebook-clone/`; connect the phone and computer to the same network and open the QR code in Expo Go.
3. Record device model, iOS/Expo Go version, point dimensions and capture scale. Capture Home, Profile, Friends, Marketplace and Settings, plus Menu, notifications, composer and a chat. Keep original native captures here.
4. Test text/photo posts, cancelled picker, reactions/comments/saving, request decisions, search, listing message, notification read/preferences, all settings, app reload persistence and reset. Verify public preview excludes private posts/photos and is read-only.
5. Scroll through all 24 Home posts, the eight-story strip, six Maya posts and 16 Marketplace listings. Verify Back to top, the filled Settings gear and lower Settings controls; store updates should not reset scroll position or discard comment drafts.
6. Check notch/home-indicator spacing, back gestures, VoiceOver labels, touch targets, keyboard clearance, reduced motion and light/dark colors. After initial loading, verify content actions need no external API or image requests.

If a simulator becomes available later, run `npm run ios` and use native simulator capture tools. Do not replace this checklist with phone-browser screenshots. A standalone signed build and offline cold launch are outside the selected Expo Go handoff.
