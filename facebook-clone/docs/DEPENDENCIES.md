# Dependency audit and SDK 57 mitigation

The demo stays on Expo SDK 57 for the selected iPhone Expo Go workflow. Dependencies are pinned by the single npm lockfile. No forced SDK upgrade or dependency override was applied.

## Runtime URI decoder

On 2026-11-11, `npm audit --omit=dev` reported seven dependency-tree findings: three high entries for the same decoder chain and four moderate entries for the fingerprint build-tool chain. The decoder has two advisories: [exponential malformed-input decoding](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) and [quadratic replacement of encoded runs](https://github.com/advisories/GHSA-qr28-fpjm-wq7f). Both require a fix equivalent to 0.5.1; 0.5.0 is insufficient.

The installed chain is `expo-router@57.0.30 → query-string@7.1.3 → decode-uri-component@0.2.2`. These are the latest releases in their compatible Router 57/query-string 7 lines. The fixed decoder 0.5.1 exports an ESM default, whereas query-string 7 calls the CommonJS `require` result directly. Overriding the package version alone would break that call.

[Metro configuration](../metro.config.js) replaces only the resolved entry file of this installed decoder with a [small CommonJS adapter](../src/platform/decode-uri-component.cjs). It delegates valid input to the platform `decodeURIComponent`; malformed input goes through standards-based `URLSearchParams`. Literal `&` characters are escaped before constructing the temporary query, so they cannot split a value into extra parameters. Invalid UTF-8 becomes the standard replacement character, instead of the upstream package's partial literal decoding. Valid Unicode, reserved characters, encoded/literal plus signs and query-string arrays retain their behavior.

This uses Expo's documented [custom Metro resolver](https://docs.expo.dev/guides/customizing-metro/#aliases) mechanism and applies to both web and native bundles. Expo 57 already supplies WHATWG URLSearchParams on native. Other resolutions, including different copies of the package, remain untouched.

**The installed vulnerable package remains in the lockfile, so npm audit still reports it.** The mitigation replaces its runtime entry in Metro-built app bundles; it does not patch arbitrary Node tools that independently require the installed package. Do not report the dependency tree as audit-clean. The app is a local static web/native demo, not a Node query-parsing service.

Tests load the real installed query-string 7 implementation against the adapter, check normal and malformed inputs, exercise Expo's WHATWG implementation, run large hostile payloads in a process with a three-second timeout, and verify resolver targeting. Run `npm test`, then restart Metro and rerun both platform exports after changing this configuration. Export success is not an iPhone runtime check.

## Build-tool findings

`@expo/fingerprint@0.20.15` retains `glob@13.0.7` and `minimatch@10.2.6`. Their advisories concern [cancellation bypass in filesystem traversal](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) and [pattern amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249). These packages inspect project files/ignore patterns during development and build tooling; they are not used by the demo's feed or local data flows. The four moderate audit entries include the parent packages `expo` and `@expo/fingerprint`, not four separate underlying defects.

There are no patched releases within the installed glob 13/minimatch 10 ranges. Force-upgrading their major versions would change Expo's build-tool dependency contract. Leave these findings recorded while building this trusted local repository; revisit them before accepting untrusted projects or glob patterns in a hosted build service.

## Retirement

When a compatible Expo/Expo Go upgrade supplies a patched decoder with a compatible caller, remove the Metro alias, adapter and version-specific tests together. Re-run the audit, type/lint/unit/browser checks, both exports, direct-refresh/deep-link tests, and the iPhone smoke checks. Review fingerprint findings against the upgraded SDK independently.
