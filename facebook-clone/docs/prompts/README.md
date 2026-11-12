# Astra page prompts

These Markdown files are **implementation prompts for a later Astra run**. They are not a claim that the app is built. Keep this documentation phase separate from app implementation.

## Run order

1. [Astra lead / agent workflow](00-orchestrator.md)
2. [Shared shell and local state](00-shared-shell.md)
3. [Home feed](01-home.md)
4. [Profile](02-profile.md)
5. [Friends](03-friends.md)
6. [Marketplace](04-marketplace.md)
7. [Settings](05-settings.md)
8. [Secondary views and cross-page navigation](06-secondary-views.md)
9. [Visual and functional QA](07-qa.md)

Give Astra [the build brief](../ASTRA_PLAN.md), [the source atlas](../SOURCE_ATLAS.md), and [the content contract](../CONTENT_AND_INTERACTIONS.md) as shared context, then the page prompt being worked on. A page agent should inspect the repository before editing, use the existing architecture, and coordinate shared files through one owner. The prompts define visible results and checks rather than forcing a component tree.

## Rule shared by every prompt

Build **one responsive web application for desktop and phone browsers** for a fictional, pre-signed-in personal account. The desktop reference is a web screenshot; the phone references are mobile-app screenshots used to guide the responsive web layout. Capture all five primary views at both 1440 × 900 and 390 × 844. At phone width, retain the demo's consistent mobile navigation and functional controls even if a source shows a different app version. Use local fictional images and deterministic seed data. Never copy real names/photos/text from the reference captures into runtime content, request Facebook credentials, make Facebook API calls, hotlink runtime images, or add random/infinite feed content.

**Visual precedence:** desktop Home slide 5 → desktop Profile slide 8 → Senior Planet desktop account/Settings → Digital for Life 2026 phone screens → supplementary Friends/Marketplace screenshots → Meta announcements for newer behavior. [Meta's logo guidance](https://www.meta.com/brand/resources/facebook/logo/) controls logo treatment.

The page agent's output should state changed files, the route/view it completed, the screenshot or interaction check it ran, and any visible difference that remains. The QA prompt owns final cross-page captures and build checks.
