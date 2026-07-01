# efBazaar Redesign Design

## Goal

Redesign efBazaar's frontend in two phases: first the landing page, then the broader marketplace platform. The new experience should feel modern, premium, and product-led: glassmorphism for brand impact, Modern SaaS Analytics Dashboard structure for marketplace confidence, and Soft UI details for approachable controls and cards.

The redesign should keep the current product promise intact: efBazaar is an eFootball account marketplace for browsing, selling, verifying, saving, and contacting sellers through the existing Telegram-first auth and marketplace flows.

## Scope

The first implementation slice covers the landing page at `/` and any shared visual utilities needed to support it cleanly.

The design direction should also define how later platform screens evolve:

- `/marketplace`
- `/marketplace/[id]`
- `/marketplace/new`
- `/profile`
- auth pages where visual consistency matters

The first slice should not rebuild backend behavior, invent fake marketplace APIs, or add dashboard data that the product cannot support. Product preview content on the landing page may use curated static examples, but it must be clearly presented as a visual preview rather than live operational data.

## Current Context

The frontend is a Next.js app using React, TypeScript, Tailwind, shadcn-style primitives, and lucide-react icons. Existing routes already include:

- `/` landing page.
- `/marketplace` public browse page.
- `/marketplace/[id]` listing detail page.
- `/marketplace/new` create listing page.
- `/auth/login`, `/auth/register`, and `/profile`.

The current landing page already has good marketplace routing and a useful product preview, but its visual language leans cyber/neon. The new direction should keep the dark base and accent energy while making the product feel calmer, more polished, and more commercially trustworthy.

Existing marketplace pages are compact and functional. Later platform redesign work should make them feel like a usable analytics-backed marketplace surface, not a marketing page.

## Recommended Direction

Use a "premium marketplace command center" direction:

- Dark, refined SaaS base.
- Frosted glass header and hero panels.
- Soft UI controls with restrained shadows and fine borders.
- Dashboard-like product preview with listings, filters, price signals, trust states, and chat status.
- Cyan, emerald, and amber accent palette, with purple used sparingly or removed from dominant surfaces.
- Dense information hierarchy inside platform screens.

This balances the user's requested themes without making the app feel like a decorative template. Glassmorphism sells the landing page; analytics structure sells trust; Soft UI makes repeated marketplace workflows easier to use.

## Landing Page Experience

### Header

The header should be sticky, translucent, and compact. It should keep the efBazaar logo visible and provide direct routes to marketplace browsing, trust, flow, login/profile, and the primary marketplace call to action.

The header should avoid crowding on mobile. Mobile can keep logo plus one or two high-value actions rather than reproducing the full desktop nav.

### Hero

The first viewport should make efBazaar the dominant brand signal. The headline should be short and literal, with the value proposition in supporting copy.

Primary CTA:

- `Bozorni ko'rish` to `/marketplace`

Secondary CTA:

- `Akkount joylash` to `/marketplace/new`

The hero should show a rich marketplace preview beside or below the copy. This preview should look like a live product surface:

- search or filter bar
- featured account/listing card
- price, division, team strength, and coin metrics
- valuable player tags
- Google/Telegram trust badges
- like/cart activity
- chat status or 24-hour timer

The preview should use real UI composition, not an abstract illustration.

### Market Signal Strip

Below the hero, add a compact signal band with four marketplace facts or product pillars. Suggested items:

- Division filters
- Telegram-first login
- Google verified profile signal
- Buyer-seller chat window

These should be small dashboard stats, not large marketing cards.

### Marketplace Features

Create a feature band that shows what users can do:

- Browse with filters.
- Compare account strength and player value.
- Check trust indicators.
- Save listings.
- Start a seller chat.
- Create and manage a listing.

Each feature should use a lucide icon, concise title, and short body. Cards should be glassy but not nested inside another card.

### Trust

Keep the trust section focused on the existing system:

- Telegram-first login.
- Server-side session verification.
- Google profile linking.
- Backend-derived seller identity.

Do not overpromise escrow, payment protection, moderation, or verification features that are not implemented.

### Flow

The flow section should be simple and product-specific:

1. Browse or sell an account.
2. Inspect division, strength, coins, players, and trust signals.
3. Chat with the owner through the marketplace flow.

### Final CTA

End with a compact glass CTA band that routes users into `/marketplace` and `/marketplace/new`. It should feel like a continuation of the app surface, not a separate campaign block.

## Platform-Wide Design Direction

After the landing page, platform screens should adopt the same visual system with less decoration and more utility.

### Marketplace Browse

The browse page should feel like a marketplace dashboard:

- compact sticky app header
- filter chips and search controls
- sort/filter states that are easy to scan
- listing cards with stable metric slots
- clear empty, loading, and error states
- mobile bottom navigation if it remains useful

Cards should keep a dense but polished layout: price, division, strength, coins, negotiable status, trust badge, like count, and key players. Hover states should be subtle.

### Listing Detail

The detail page should prioritize decision-making:

- title and price
- status and trust badges
- media area, using existing listing media when available and a compact empty-media state otherwise
- stat grid
- valuable player tags
- seller/contact actions
- auth-aware protected actions

The layout should not feel like another hero page. It should feel like inspecting an account.

### Create Listing

The create listing flow should use a clear form layout with grouped fields:

- account basics
- player/value signals
- coins and strength
- price and negotiation
- media guidance

Use Soft UI form controls and clear validation states. Avoid heavy explanatory paragraphs inside the form.

### Profile and Auth

Profile and auth pages should use the same glass/Soft UI shell but stay focused. Profile should make Telegram and Google states obvious. Auth should keep the current Telegram-first logic and not introduce extra credential flows.

## Visual System

### Layout

- Use full-width page bands with constrained inner content.
- Avoid cards inside cards.
- Keep fixed-format UI elements stable with explicit sizing, grids, or aspect ratios.
- Use responsive grids that collapse cleanly at mobile widths.
- Do not let text overlap or overflow buttons, chips, or stat tiles.

### Color

Use a dark neutral base with varied accents:

- near-black/slate base for app depth
- cyan for primary interactive accents
- emerald for trust and success
- amber for premium/value cues
- white and slate text hierarchy

Avoid a one-note purple/blue gradient theme. Purple can remain as a minor accent only if it does not dominate the page.

### Glass and Soft UI

Glass panels should use:

- translucent backgrounds
- subtle blur
- low-contrast borders
- restrained shadows

Soft UI should appear in controls, metric tiles, and selected states. It should not make the interface puffy or low-contrast.

### Typography

Use strong hero-scale type only in the landing hero. Inside app screens, use compact headings and readable metric labels. Letter spacing should remain normal except for small uppercase labels where the existing style requires it.

### Icons

Use lucide-react icons for buttons, stats, trust states, filters, and feature cards. Do not create custom SVG icons when lucide has a suitable symbol.

## Component Strategy

For the first landing implementation, keep edits focused:

- Update `frontend/src/app/page.tsx` for the redesigned landing structure.
- Reuse `Logo`, `Button`, and existing utility classes where possible.
- Add small local helper components inside `page.tsx` only when they are specific to the landing page.
- Add or tune shared CSS utilities in `frontend/src/app/globals.css` only when they are reusable and reduce repeated Tailwind noise.
- Avoid broad refactors of marketplace components during the landing slice.

For later platform implementation, migrate repeated visual patterns into shared components only after they appear in multiple pages.

## Content Rules

Use Uzbek marketplace copy consistent with the current app. Keep copy direct and product-specific.

Do not claim:

- escrow
- guaranteed safe payments
- official Konami affiliation
- AI pricing recommendations
- seller verification beyond Telegram/Google/profile signals

Do show:

- eFootball account marketplace
- Telegram-first access
- Google profile signal
- division, team strength, coins, players, price, chat

## Error Handling And States

The landing page is mostly static, so runtime error handling is limited. Interactive links should route to existing pages.

Platform pages should preserve existing behavior:

- anonymous browse/detail remains public
- protected actions route or prompt for login
- failed loads show compact error panels
- empty states use the same card language as listing content

## Testing And Verification

For the landing slice:

- Run `npm run typecheck` in `frontend`.
- Run `npm run build` in `frontend` if dependencies and environment allow it.
- Start the Next dev server and inspect `/` on desktop and mobile widths.
- Verify CTAs route to `/marketplace`, `/marketplace/new`, `/auth/login`, and Telegram link as intended.
- Check for text overflow at around 390px mobile width.
- Check that visual assets and icon surfaces are nonblank and aligned.

For later platform slices:

- Keep existing marketplace helper tests passing.
- Add focused tests when pure formatting, filter, or routing behavior changes.
- Use manual responsive checks for browse, detail, create listing, auth, and profile.

## Rollout

Phase 1: Redesign landing page and verify responsive layout.

Phase 2: Redesign marketplace browse and listing cards using the same visual system.

Phase 3: Redesign listing detail and protected action states.

Phase 4: Redesign create listing, profile, and auth surfaces.

Each phase should be independently reviewable and should keep existing routes and auth behavior working.
