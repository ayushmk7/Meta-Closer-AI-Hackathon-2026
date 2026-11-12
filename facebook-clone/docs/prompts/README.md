# Astra page prompts

> Accepted implementation scope: responsive web + native iOS through Expo Go. Android testing/distribution is deferred. See [architecture and extension contract](../ARCHITECTURE.md).


These Markdown files are the implementation and review prompts used by Astra. Keep them as the per-page contract; consult `docs/verification/README.md` for actual completed checks.

## Run order

1. [Astra lead / agent workflow](00-orchestrator.md)
2. [Shared seed, state, and web shell](00-shared-shell.md)
3. [Native mobile foundation](00-native-foundation.md)
4. [Home feed](01-home.md)
5. [Profile](02-profile.md)
6. [Friends](03-friends.md)
7. [Marketplace](04-marketplace.md)
8. [Settings](05-settings.md)
9. [Secondary views and cross-page navigation](06-secondary-views.md)
10. [Visual and functional QA](07-qa.md)

Give Astra [the build brief](../ASTRA_PLAN.md), [the source atlas](../SOURCE_ATLAS.md), [the native app specification](../MOBILE_APP_SPEC.md), and [the content contract](../CONTENT_AND_INTERACTIONS.md) as shared context, then the page prompt being worked on. A page agent should inspect the repository before editing, use the existing architecture, and coordinate shared files through one owner. The prompts define visible results and checks rather than forcing a component tree.

## Rule shared by every prompt

Build a **responsive website for desktop and phone browsers plus a real native iOS app** for a fictional, pre-signed-in personal account. The desktop reference is a web screenshot; the phone references are mobile-app screenshots used for both native and phone-browser layouts. Capture all five primary views in web at 1440 × 900 and 390 × 844 and in native iOS runtimes. A phone browser screenshot does not count as a native-app check. Keep the demo's consistent mobile navigation and functional controls even if a source shows a different app version. Use the same fictional deterministic seed and local asset keys across platforms. Never copy real names/photos/text from reference captures into runtime content, request Facebook credentials, make Facebook API calls, hotlink runtime images, or add random/infinite feed content.

**Visual precedence:** desktop Home slide 5 → desktop Profile slide 8 → Senior Planet desktop account/Settings → Digital for Life 2026 phone screens → supplementary Friends/Marketplace screenshots → Meta announcements for newer behavior. [Meta's logo guidance](https://www.meta.com/brand/resources/facebook/logo/) controls logo treatment.

The page agent's output should state changed files, the route/view it completed, the screenshot or interaction check it ran, and any visible difference that remains. The QA prompt owns final cross-page captures and build checks.
