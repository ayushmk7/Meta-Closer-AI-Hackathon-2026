# Astra prompt: Marketplace

Implement **Marketplace** as a local browsing demo with six fixed listings. Read the build brief, source atlas, visual spec, and content contract. Inspect shared routes, search, images, and Messenger before editing. Preserve the main Home header style across this page.

## References to inspect

The [desktop Marketplace screenshot](../references/images/desktop-marketplace-moonlock.webp) provides the clearest full page: header, left browse/filter rail, and photo-first listing grid. The [2026 Shopify crop](../references/images/desktop-marketplace-shopify.png) adds more recent rail/card type treatment but includes an ad and is mid-scroll. The [Facebook iOS App Store crop](../references/images/mobile-marketplace-2026-ui.png) shows the phone's Marketplace title, Sell/For you/Local/More tabs, Today's picks, two-column cards, and bottom navigation. [Meta's 2025 Marketplace update](https://about.fb.com/news/2025/11/facebook-marketplace-gets-a-glow-up/) and [2026 seller update](https://about.fb.com/news/2026/03/facebook-marketplace-new-meta-ai-tools-make-selling-faster-and-easier/) inform listing and seller-message behavior. The App Store blue promotional frame and Shopify sponsored placement are not app UI.

## Desktop layout

Use the shared sticky white header with Marketplace active. Below it, put a narrow left Marketplace rail with title, search field, Browse all, saved listings, local filter controls, and categories supported by the six-item seed. To its right, show **Today's picks** or **Local listings** with a compact location label and a dense grid of photo-first cards. Aim for four columns at 1440 px if images remain legible; cards should have near-square local thumbnails, bold price, one- or two-line title, and muted location. Use the brief's light tokens and Home-derived spacing, not the old blue header seen in some older Marketplace slides. No sponsored cards, checkout, shipping, or AI generation.

## Mobile layout

At **390 × 844**, use a page title with search/Messenger icons, a compact horizontal row for **For you, Local, Saved** (and only other supported filters), then a two-column listing grid. Search/filter options can open a mobile sheet with clear Apply/Clear actions. Prices and titles remain readable in narrow cards; use stable square crops and no horizontal overflow. Keep the shared five-destination bottom nav, with Marketplace active; the App Store marketing screenshot shows another order, so do not silently change the demo navigation. Detail view opens in the same local app and returns to the grid with back navigation.

## Listing detail and interactions

Use the six fictional listings from the content contract: desk lamp, city bike, bookcase, camera, plant stand, coffee table. Each detail view shows local photos, title, price, condition/category, location, fictional seller, description, Save/Unsave, and **Message seller**. Search matches title/description case-insensitively. Filters only expose categories and ranges with meaningful behavior against the seed. Save state persists and appears in a Marketplace Saved view. Message seller opens a local Messenger conversation about that listing and permits a user message; it never contacts a real seller. If a Create listing button is visible, either implement a local listing composer with validation/persistence or omit the button. The requested scope is browsing and messaging, so omitting Create listing is acceptable.

## Completion check

Capture Marketplace at **1440 × 900** and **390 × 844**. Compare left-rail width, grid density, photo crop, price/title/location hierarchy, phone two-column gutters, and bottom-nav clearance. Search for a seeded listing, filter it, open its detail, save it, message its seller, refresh, and verify the saved/message state. Confirm every displayed category/control has a real local result.
