# Facebook clone: Astra handoff

> Accepted implementation scope: responsive web + native iOS through Expo Go. Android testing/distribution is deferred. See [architecture and extension contract](ARCHITECTURE.md).


Reference documentation complete. Responsive web and native iOS implementations are available; runtime verification status is recorded in [verification](verification/README.md). This folder is the source of truth for the private hackathon demo described in the [build brief](ASTRA_PLAN.md). The deliverables are **a responsive website for desktop and phone browsers, plus a native iOS mobile app**. They share the same fictional seed and behavior.

Read in this order:

1. [Reference pack](REFERENCES.md) — visual precedence, local image inventory, and measured desktop proportions.
2. [Source atlas](SOURCE_ATLAS.md) — expanded desktop and mobile sources, dates, what each source proves, and version caveats.
3. [Visual specification](VISUAL_SPEC.md) — page layouts, responsive behavior, tokens, and comparison targets.
4. [Mobile app specification](MOBILE_APP_SPEC.md) — native screen structure, storage, navigation, and iOS checks.
5. [Content and interactions](CONTENT_AND_INTERACTIONS.md) — deterministic seed, local state, navigation, and behavior contracts.
6. [Astra implementation plan](ASTRA_PLAN.md) — work sequence, checks, and acceptance criteria.
7. [Page prompts](prompts/README.md) — copy-ready instructions for the shared shell, each page, native mobile, secondary views, and visual QA.

The demo must be pre-signed-in and use fictional people and local images. It must not request Facebook credentials or call Facebook APIs. The finished project README must say **“Unofficial hackathon demo; not affiliated with or endorsed by Meta or Facebook.”**

Reference screenshots and PDFs are included for design study only. They contain real people and third-party material; do not copy their names, photos, or text into the app's seed data.

Implementation guides: [architecture](ARCHITECTURE.md), [feature extensions](EXTENDING.md), and [verification evidence](verification/README.md).
