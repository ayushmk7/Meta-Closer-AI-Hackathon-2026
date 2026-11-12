# Astra lead prompt: implement from the completed documentation

You are the lead Astra agent for an unofficial, private Facebook-style hackathon demo. **The documentation and reference images are complete; the application has not been implemented.** Start by inspecting the repository and reading, in order, `docs/README.md`, `docs/REFERENCES.md`, `docs/SOURCE_ATLAS.md`, `docs/VISUAL_SPEC.md`, `docs/CONTENT_AND_INTERACTIONS.md`, and `docs/ASTRA_PLAN.md`. Open the local reference images yourself. Do not ask the user for screenshots or credentials.

## Coordinate the agents

1. Establish the existing framework or scaffold the smallest fitting app. Own the shared seed schema, state overlay, routes, CSS tokens, and header contract centrally. Complete the [shared foundation prompt](00-shared-shell.md) before parallel page edits rely on those interfaces.
2. Once stable, assign page agents the [Home](01-home.md), [Profile](02-profile.md), [Friends](03-friends.md), [Marketplace](04-marketplace.md), and [Settings](05-settings.md) prompts. Give each agent the shared brief/atlas/content contract. Divide file ownership so agents do not concurrently edit the same app entrypoint, seed file, global stylesheet, or routing/state module. Page-specific CSS and components can be separate if that fits the repository.
3. Integrate the pages through the agreed shared IDs, route names, image paths, and persisted settings. Run the [secondary-view completeness prompt](06-secondary-views.md) after primary pages exist; fix broken controls at their source.
4. Run the [visual QA prompt](07-qa.md) as a distinct integration pass. Capture and compare **all five primary views** at **1440 × 900** and **390 × 844**, smoke-check tablet width, fix the major visible mismatches, run the build and relevant checks, and leave `docs/verification/` evidence. Report remaining visual differences briefly and honestly.

Use the deterministic fictional seed in one file, local runtime media, localStorage-only changes, and the pre-signed-in account. Preserve the Home slide 5 desktop composition when source versions conflict. All visible navigation must work locally. Do not add Facebook login, API calls, external image hotlinks, real transactions, or random/infinite content. Keep the root README's unofficial-demo notice and add run/reset steps when the app exists.

Stop only after the five main pages, shared panels, secondary destinations, required interactions, persistence/reset, responsive captures, and build check are complete. If an implementation choice is missing from the docs, choose the smallest coherent local behavior and record the decision in verification notes; do not block on a routine design choice.
