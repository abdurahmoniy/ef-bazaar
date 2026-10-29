# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The main website at efbazaar.uz and the Telegram Mini App share one Next.js application. Repository basis: [README.md](README.md).

## Users

The documented marketplace serves people buying, selling, or exchanging eFootball accounts. Sellers publish listings; buyers discover accounts and contact sellers through listing conversations. Repository basis: [monorepo domain conventions](../CLAUDE.md#marketplace--domain-modeli) and [marketplace documentation](README.md#marketplace-filter-panel).

## Product Purpose

efBazaar is an eFootball account marketplace. Listings, player-card discovery, buyer/seller chat, trade coordination, and payments are existing product capabilities. Repository basis: [CLAUDE.md](../CLAUDE.md#loyiha-haqida) and its service responsibilities.

## Operating Context

- The frontend uses Next.js App Router, React, TypeScript, and existing same-origin service proxies. Authentication uses the established cookie and refresh flow. See [README.md](README.md#backendga-qanday-murojaat-qilinadi).
- Marketplace discovery supports player criteria and detailed account filters; Mobile, Steam, and PlayStation have distinct applicable fields. Price displays use so‘m. See [README.md](README.md#marketplace-filter-panel).
- Trade-service owns the escrow lifecycle; payment-service owns wallet/payment responsibilities; Smart Admin automation is handled by the existing worker. See [CLAUDE.md](../CLAUDE.md#repo-strukturasi).

## Capabilities and Constraints

Retain existing authentication, authorization, marketplace filters, listing creation, chat, and trade contracts. A marketing surface must link into these flows rather than create its own transaction or permission model. Prices, limits, and paid capabilities remain service-owned; the frontend must preserve unavailable states instead of inventing grants. Repository basis: [README.md](README.md) and [authentication architecture](../CLAUDE.md#auth-arxitekturasi-muhim--barcha-servislar-uchun-qoida).

## Published Landing v2

After reviewing the comparison route, the user requested publishing Landing v2 as the main `/` homepage and deploying all current changes. `/landing-v2` permanently redirects to `/`. The homepage is indexable with a root canonical, retains existing referral handling and organization/website/application structured data, and has its own [design record](src/components/landing-v2/DESIGN.md). It reuses `AuthAwareLink` and marketplace player-filter serialization. Repository basis: [route documentation](README.md#landing-v2), [page metadata](src/app/page.tsx), [former route](src/app/landing-v2/page.tsx), and [implementation](src/components/landing-v2/landing-v2.tsx).

## Evidence on Hand

The supplied concept photograph, local font files, and retained font licenses are recorded in [the asset provenance file](public/landing-v2/README.md). They belong to this route's implementation. This record establishes no customer counts, testimonials, performance benchmarks, or new pricing claims.

## Open Decisions

Audience demographics, measured conversion goals, and any product-wide brand replacement are not established by these sources. Leave them open; the landing concept alone does not settle them.
