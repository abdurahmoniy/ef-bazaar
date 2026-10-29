---
name: efBazaar Landing v2
description: Football transfer poster for the efBazaar homepage.
colors:
  background: "hsl(var(--background))"
  foreground: "hsl(var(--foreground))"
  primary: "hsl(var(--primary))"
  primary-foreground: "hsl(var(--primary-foreground))"
  primary-text: "hsl(var(--primary-text))"
  secondary: "hsl(var(--secondary))"
  secondary-foreground: "hsl(var(--secondary-foreground))"
  muted: "hsl(var(--muted-foreground))"
  rule: "hsl(var(--border))"
  outline: "hsl(var(--input))"
  surface: "hsl(var(--card))"
  surface-hover: "hsl(var(--muted))"
  focus: "hsl(var(--ring))"
typography:
  display:
    fontFamily: "'Landing Display', sans-serif"
    fontSize: "clamp(64px, min(7.5vw, 10svh), 112px)"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "'Landing Display', sans-serif"
    fontSize: "clamp(44px, 5vw, 72px)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.01em"
  body:
    fontFamily: "var(--font-inter), system-ui, sans-serif"
    fontSize: "16px"
    lineHeight: 1.5
  label:
    fontFamily: "var(--font-inter), system-ui, sans-serif"
    fontSize: "12px"
    letterSpacing: "0.14em"
rounded:
  pill: "999px"
  notice: "16px"
spacing:
  gutter-min: "16px"
  control-inline: "28px"
  small-gap: "16px"
  column-gap: "40px"
  wide-gap: "80px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.pill}"
    padding: "0 28px"
  button-primary-hover:
    backgroundColor: "color-mix(in srgb, hsl(var(--primary)) 90%, hsl(var(--background)))"
  button-outline:
    textColor: "{colors.foreground}"
    rounded: "{rounded.pill}"
    padding: "0 28px"
  button-outline-hover:
    backgroundColor: "{colors.surface-hover}"
  button-login:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
  player-row:
    textColor: "{colors.foreground}"
    padding: "16px max(24px, calc((100% - 1280px) / 2)) 20px"
  player-row-hover:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
  smart-admin:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.notice}"
    padding: "18px 22px"
  flow-pill:
    textColor: "{colors.foreground}"
    rounded: "{rounded.pill}"
    height: "55px"
---

# Design System: efBazaar Landing v2

## Overview

**Creative North Star: "Football transfer poster"**

This descriptive shorthand records the published `/` homepage: condensed display type, a gold duotone photograph, theme-aware surfaces, and full-width player rows. The user promoted the approved comparison design to the homepage; `/landing-v2` permanently redirects there. This display system applies to the marketing homepage; other application screens retain their existing UI typography.

Ground truth is [the component](landing-v2.tsx), [its CSS module](landing-v2.module.css), and [homepage metadata](../../app/page.tsx). Product contracts remain those recorded in [PRODUCT.md](../../../PRODUCT.md). The schema v2 [sidecar](.impeccable/design.json) uses the same semantic roles; any embedded light/dark token values serve only its isolated previews. Production colors inherit [globals.css](../../app/globals.css).

**Key Characteristics:**

- Large uppercase player and headline typography.
- Existing efBazaar blue for actions and emphasis, with gold highlights and photo treatment.
- Rule-separated rows and generous section spacing.
- A preserved source photograph with CSS duotone and print dots.
- The official shared logo and a user-controlled, persistent light/dark theme.

## Colors

### Shared theme roles

The user requested efBazaar colors for the landing. The route now inherits the app's light/dark theme without declaring a separate palette or overriding global tokens.

- **Background / foreground:** page canvas and normal text.
- **Primary / primary foreground:** blue-and-gold calls to action, selected player rows, skip link, and text selection.
- **Primary text:** readable blue headings, links, icons, and Garov labels in each theme.
- **Secondary / secondary foreground:** gold photo treatment, Smart Admin highlighting, and the Garov stamp with dark readable text.
- **Muted foreground:** supporting copy and metadata.
- **Card / muted:** notice surfaces and outlined-control hover surfaces.
- **Border / input / ring:** section rules, control outlines, and keyboard focus.

**The Route Boundary Rule.** Reference these semantic roles through `hsl(var(--…))`. Change the shared palette in `globals.css` when a product-wide change is intended; do not copy brand hex values into this route.

## Typography

**Display font:** Big Shoulders Display, self-hosted under the CSS alias `Landing Display`, with sans-serif fallback.
**Body font:** the same Inter variable and system fallbacks as the marketplace. The landing does not register a separate body face.

The display face is served locally; Inter is supplied by the root Next.js font configuration. Original concept asset provenance and licenses are retained in [the asset documentation](../../../public/landing-v2/README.md).

- **Display:** the frontmatter display role is the desktop hero. Player names use `clamp(48px, 7vw, 100px)`, weight 800, line-height .98. The closing headline uses `clamp(64px, 8vw, 116px)`, weight 800, line-height .95.
- **Headline:** section titles use the frontmatter headline role.
- **Body:** the route base is the frontmatter body role; supporting paragraphs use 13–18px according to their observed component roles.
- **Label:** section labels use the frontmatter label role with uppercase text. Location and Smart Admin labels have their own smaller tracking.
- **Football minutes:** 0′, 45′, and 90′ use the display face at 88px on desktop; only the prime mark uses the gold secondary color.

Responsive type changes are recorded below. Do not transfer this display scale to marketplace application screens.

## Layout

The shared `--app-content-max-width` token in `globals.css` is 80rem (1280px). Landing wrappers and the marketplace shell use it for the same centered wide content area, with at least 16px side padding and the shared safe-area variables. Full-width player-row text aligns through `--gutter: max(1rem, calc((100% - var(--app-content-max-width)) / 2 + 1rem))`. The header uses the marketplace’s sticky surface and 56px inner height plus its border; safe-area top padding belongs to that header. The hero art is bounded by the same wide container. Phones retain natural vertical scroll and a smaller three-line heading.

`scripts/landing-v2-viewport-check.mjs` checks real browser geometry: horizontal clipping, action target height, and complete hero/Smart Admin visibility at laptop widths. Verified laptop viewport sizes include 1470×820, 1366×768, and 1280×720, with additional checks at 1024×768, 768×1024, 390×844, and 320×740.

## Elevation & Depth

There are no box shadows in this route. Rules, tonal layering, the themed Smart Admin panel, and the photograph establish depth.

The desktop poster uses .6 opacity to keep overlaid text readable. The supplied photograph remains unchanged on disk. CSS applies grayscale, contrast 1.12, multiply blending over the shared gold secondary color, horizontal/vertical fade masks, and a 5px print-dot pattern at .3 opacity. The photograph is decorative and hidden from assistive technology.

## Shapes

Long pill controls and the Garov flow use the frontmatter pill radius. The Smart Admin notice uses the notice radius. Most page structure stays flat and rectangular, separated by single-pixel rules. The Garov stamp is circular, 138px wide on desktop, tilted −12 degrees; it becomes 110px below 1000px and disappears below 760px.

## Components

### Buttons and links

Primary and outlined CTAs share a 56px minimum height (48px for hero actions), centered inline layout, 20px icon gap, and the frontmatter padding. The session action uses shared `buttonVariants`: primary fill, primary foreground, user icon, and 36px desktop height. The theme control uses the same 36px desktop size as the marketplace. Below 640px both become at least 44px tall. Shared `SlidingNav` supplies 13px semibold desktop navigation; its links become 44px tall below 640px. Text links retain 44px minimum heights.

Hover color changes take 180ms. Links have a shared ring-token 2px focus outline offset by 6px. The skip link appears on focus and targets the focusable main region. These are links into established flows: marketplace browsing, listing creation, login/profile, help, and configured social/bot URLs.

### Header and footer

The header and footer reuse the canonical `Logo` component in its `sm` size, including the official `BrandMark`, blue/gold icon chip, and app font. No landing-specific text wordmark or custom recoloring overrides it. Navigation is muted, becoming primary text on hover. Login/profile selection remains delegated to `AuthAwareLink`; `/api/session` now verifies the user through the same loader as the marketplace instead of inferring identity from cookie presence. At narrow sizes the footer stacks and the header retains all three navigation destinations.

The header reuses `ThemeToggle`, backed by the shared `useTheme` hook and `efbazaar-theme` preference. Its accessible label names the available action: `Qorong‘i rejim` or `Yorug‘ rejim`. The selected mode is applied to the app root and survives reload through the existing theme bootstrap. The landing inherits that choice; it does not force a dark class. The initial mode follows the saved/Telegram/system preference.

### Smart Admin notice

A bordered card surface places a primary-text shield label above a sentence with a gold highlight and its matching secondary foreground. It keeps explanatory copy and the in-page Garov link together; its phone padding is 20px.

### Player rows

The five full-width links use tabular row numbers, oversized uppercase names, an optional caption, and an up-right arrow. Hover and keyboard focus use the same primary fill and primary foreground as marketplace actions. The arrow rotates 45 degrees and translates by 3px/−3px over 220ms with `cubic-bezier(.16, 1, .3, 1)`. Focus uses an inset-offset primary-foreground outline.

Each row uses `buildListingSearchParams` for the existing `valuable_players_name` attribute. Display names are not counts or promises of inventory.

### Steps, Garov flow, and principles

The ordered steps use football-minute markers with top rules. The Garov diagram is a horizontal buyer → Garov → seller flow of outlined pills; the center uses the readable primary-text color. The diagram remains horizontal on phones with smaller labels and arrows. Principles use a description list with primary-text check icons and rule-separated rows.

The copy distinguishes Mobile Garov/Smart Admin from Steam and PlayStation admin assistance. This document records that presentation; it does not change the trade service.

### Motion and closing action

The closing action repeats the primary marketplace CTA and outlined bot CTA. The route uses state transitions only. `prefers-reduced-motion: reduce` removes link/arrow transitions and the player-arrow transform.

## Do's and Don'ts

### Do:

- **Do** keep the condensed display treatment scoped to the `/` marketing homepage.
- **Do** reuse the recorded palette, local fonts, existing links, and marketplace filter helper.
- **Do** retain the source photograph and apply its duotone treatment in CSS.
- **Do** preserve the skip link, visible keyboard focus, reduced-motion rules, and narrow-screen stacking.

### Don't:

- **Don't** replace the global application palette or UI typography with homepage-specific styles.
- **Don't** introduce prices, customer proof, inventory counts, or backend guarantees from this visual concept.
- **Don't** replace existing authentication, marketplace, or trade contracts with landing-specific flows.
