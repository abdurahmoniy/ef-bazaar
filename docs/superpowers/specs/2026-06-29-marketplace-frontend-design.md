# Marketplace Frontend Design

## Goal

Build the first efBazaar marketplace frontend slice on top of the existing backend and auth flow. The slice should let visitors browse listings publicly, view listing details, and see auth-aware calls to action for actions that require Telegram login.

## Scope

This first slice includes:

- `/marketplace` public listing browse page.
- `/marketplace/[id]` public listing detail page.
- Server-side API helpers and TypeScript types for listing browse/detail plus first protected marketplace actions.
- Auth-aware UI states for like, cart, chat, create listing, and my listings entry points.
- Landing page integration so primary marketplace calls to action route into the new module.
- Chempionat-X/front-inspired visual structure: compact dark app shell, sticky header, dense cards, filter chips, badge-heavy sports UI, and mobile-first layout.

This slice does not include the full seller dashboard, full chat inbox, message thread UI, or complete media upload workflow. It can expose entry points and protected actions, but those broader workflows should be separate follow-up slices.

## Current Context

The frontend is a Next.js 16 app using React 19, strict TypeScript, Tailwind 3.4, shadcn-style components, and server-side API access through `frontend/src/lib/api.ts`.

Auth is already implemented:

- `getMe()` reads the current user through httpOnly cookies and `/auth/v1/users/me`.
- Telegram Mini App auto-login runs from the root layout.
- `/auth/login`, `/auth/register`, and `/profile` exist.
- Public pages can call `getMe()` and gracefully continue when the user is absent.

Marketplace backend endpoints exist under nginx's `/api/marketplace` route and service-local `/api/v1` paths:

- `GET /marketplace/v1/listings`
- `GET /marketplace/v1/listings/{id}`
- `POST /marketplace/v1/listings`
- `GET /marketplace/v1/listings/mine`
- `POST /marketplace/v1/listings/{id}/like`
- `GET /marketplace/v1/cart`
- `POST /marketplace/v1/cart/{listingId}`
- `DELETE /marketplace/v1/cart/{listingId}`
- `POST /marketplace/v1/chats`
- `POST /marketplace/v1/listings/{id}/media`

Because nginx supports optional marketplace auth, browse/detail should work anonymously. Protected actions should require a user and send the existing access token automatically through `apiFetch`.

## User Experience

The marketplace should feel closer to Chempionat-X/front than to a marketing landing page:

- Mobile-first max-width app experience, with comfortable desktop expansion.
- Sticky compact top bar with efBazaar identity, auth/profile entry, and a sell/create listing action.
- Horizontal filter chips for high-intent filters such as all, negotiable, Google linked, Division 1-3, strong teams, and liked-by-me when logged in.
- Dense listing cards showing price, division, team strength, coin counts, Google Play link status, negotiable status, like count, and valuable players.
- Clear empty, error, and loading states using the same compact card language.
- Detail page with a stronger stats layout and auth-aware actions: like, save to cart, start chat, and login prompt when anonymous.

The landing page should keep its SEO/product positioning, but its marketplace CTAs should now point to real marketplace pages rather than only auth pages. The first viewport should invite browsing, and the sell/create action should still respect auth.

## Architecture

### Files

Create focused marketplace files instead of growing `page.tsx`:

- `frontend/src/lib/marketplace.ts`
  Server-only API wrapper for marketplace endpoints. It should build listing query strings safely with `URLSearchParams` and reuse `apiFetch`.

- `frontend/src/lib/marketplace-types.ts`
  TypeScript interfaces for listing responses, page responses, filters, create request, like response, cart item response, and chat response.

- `frontend/src/lib/marketplace-format.ts`
  Small pure helpers for formatting price, dates, compact numbers, division labels, and parsing/search-param filters. These are easy to test without rendering.

- `frontend/src/components/marketplace/marketplace-shell.tsx`
  Shared compact shell/header/navigation for marketplace pages.

- `frontend/src/components/marketplace/listing-card.tsx`
  Dense list card matching Chempionat-X-style sports cards.

- `frontend/src/components/marketplace/listing-filters.tsx`
  Filter chip links that preserve search params.

- `frontend/src/components/marketplace/listing-actions.tsx`
  Client component for protected actions that call server actions. Anonymous state should render login/register links instead of firing protected requests.

- `frontend/src/app/marketplace/actions.ts`
  Server actions for like, cart add/remove, chat start, and create listing when included.

- `frontend/src/app/marketplace/page.tsx`
  Public browse page. Calls `getMe()` and marketplace browse in parallel where possible.

- `frontend/src/app/marketplace/[id]/page.tsx`
  Public detail page. Calls `getMe()` and listing detail.

Modify:

- `frontend/src/app/page.tsx`
  Link marketplace CTAs to `/marketplace` and sell/create CTAs to an auth-aware marketplace destination.

- `frontend/src/lib/types.ts`
  Only extend shared auth types if required. Prefer marketplace-specific types in `marketplace-types.ts`.

### Data Flow

1. `/marketplace` reads `searchParams`.
2. Filter parsing converts params into a typed `ListingBrowseParams`.
3. `browseListings(params)` calls `/marketplace/v1/listings`.
4. `getMe()` determines whether the viewer is logged in.
5. Listing cards render public data for everyone.
6. Protected actions receive the current user state. If anonymous, they render login/register links. If logged in, they call server actions that use `apiFetch` with auth cookies.
7. Successful mutations revalidate marketplace paths and return compact action state for the client UI.

### Error Handling

- Anonymous browse/detail should not redirect to login.
- If browse fails, show a compact error panel and preserve header/auth navigation.
- If detail returns not found, use Next `notFound()`.
- If a protected action returns 401/403, surface a login prompt instead of a generic error.
- Server actions should return `{ ok: boolean; error?: string }` rather than throwing into the UI for expected auth/business errors.

### Auth Rules

- Browsing and detail pages are public.
- Creating a listing, liking, adding to cart, starting chat, and viewing "mine" require auth.
- Do not trust seller IDs from the browser. Creation requests should send only the backend DTO fields; backend derives seller from `X-User-Id`.
- Continue using httpOnly cookies and server actions. Do not expose access tokens to browser JavaScript.

## Visual Direction

Use the Chempionat-X pattern as the strongest reference:

- Dark base.
- Compact sticky header.
- Small uppercase section labels.
- Card borders and subtle hover/selected states.
- Rounded controls at about 8px where new UI is introduced.
- Horizontal filter chips.
- Dense stats rows and badges.

Keep efBazaar's existing palette, but reduce the landing-page glass/hero feeling inside marketplace pages. Marketplace should feel like an app surface for repeated use, not a marketing section.

Avoid decorative orbs, oversized hero text, nested cards, and explanatory instructional text inside the app. UI copy should name actions and data states, not explain the product.

## Testing

Use TDD for behavior introduced in pure helpers and action routing:

- `marketplace-format` price, date, compact number, division label, and search-param parsing tests.
- Marketplace query builder tests to verify only defined filters are sent and booleans/numbers serialize correctly.
- Server action tests if the existing setup supports them. If no test runner exists, add minimal test tooling only if it fits the repo; otherwise verify with `npm run typecheck` and `npm run build`.

Manual verification:

- Anonymous user can open `/marketplace` and listing detail without redirect.
- Anonymous protected action shows login/register path.
- Logged-in state renders profile-aware controls.
- Landing page CTAs reach `/marketplace`.
- Mobile width around 390px has no overlapping text or controls.
- Desktop width keeps content readable and does not stretch cards awkwardly.

## Rollout

This is the first marketplace module. It should be complete enough to browse real listings and start authenticated actions, while leaving chat inbox, seller listing management, and media upload polish for separate focused slices.
