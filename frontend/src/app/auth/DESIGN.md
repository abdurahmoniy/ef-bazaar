---
name: efBazaar Authentication
description: Scoped record of the shared efBazaar UI used by /auth/login.
colors:
  background: "hsl(var(--background))"
  foreground: "hsl(var(--foreground))"
  card: "hsl(var(--card))"
  primary: "hsl(var(--primary))"
  primary-foreground: "hsl(var(--primary-foreground))"
  primary-text: "hsl(var(--primary-text))"
  secondary: "hsl(var(--secondary))"
  secondary-foreground: "hsl(var(--secondary-foreground))"
  muted: "hsl(var(--muted) / .45)"
  muted-foreground: "hsl(var(--muted-foreground))"
  border: "hsl(var(--border))"
  ring: "hsl(var(--ring))"
  error-surface: "hsl(var(--destructive) / .08)"
  error-text: "hsl(var(--destructive-text))"
typography:
  headline:
    fontFamily: "var(--font-inter), system-ui, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 800
    lineHeight: 1.12
    letterSpacing: "-0.03em"
  title:
    fontFamily: "var(--font-inter), system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  body:
    fontFamily: "var(--font-inter), system-ui, sans-serif"
    fontSize: "1rem"
    lineHeight: 1.7
  label:
    fontFamily: "var(--font-inter), system-ui, sans-serif"
    fontSize: ".875rem"
    fontWeight: 600
rounded:
  panel: "16px"
  notice: "10px"
  control: "var(--radius)"
spacing:
  gutter-min: "16px"
  form-gap: "20px"
  panel-padding: "32px"
  column-gap: "80px"
  compact-column-gap: "40px"
components:
  login-panel:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel-padding}"
  provider-well:
    backgroundColor: "{colors.muted}"
    rounded: "{rounded.notice}"
  error-notice:
    backgroundColor: "{colors.error-surface}"
    textColor: "{colors.error-text}"
    rounded: "{rounded.notice}"
    padding: "14px"
  google-button:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    height: "48px"
    width: "100%"
    padding: "0 24px"
---

# Design System: efBazaar Authentication

## Overview

This is a scoped record of the auth shell and `/auth/login`, an **Operate** extension of the established efBazaar UI. It creates no global visual identity. The [direction contract](../../../docs/superpowers/plans/2026-10-29-auth-login-redesign.md) records the surface decisions; [PRODUCT.md](../../../PRODUCT.md) records product constraints.

Source of truth: [auth styles](auth.module.css), [layout](layout.tsx), [page](login/page.tsx), and [form](login/login-form.tsx). Frontmatter colors bind to [global theme tokens](../globals.css); Inter comes from the [root layout](../layout.tsx) and [Tailwind configuration](../../../tailwind.config.ts). No new raster assets or fonts ship with this surface.

## Colors

The shared primary blue and gold foreground remain paired in the official logo. `primary-text` serves small emphasis, icons, and help links; `ring` serves focus. Secondary gold and its foreground style text selection.

The page uses `background`/`foreground`; the panel uses `card` and `border`. Supporting text uses `muted-foreground`. Provider/recovery wells use the translucent muted surface. Errors pair the translucent destructive surface with `destructive-text`.

**The Shared Tokens Rule.** Inherit both themes. Keep small text on `primary-text` and `destructive-text`; preserve the global fill/foreground pairs.

## Typography

All host text uses Inter with system UI/sans-serif fallbacks. Frontmatter records desktop defaults. The introduction is an `h2`, balanced within (13ch); the panel contains the sole `h1`. Introduction prose is limited to (46ch). Panel copy and feature rows use (.875rem), with line heights (1.65 and 1.6); help uses (.8125rem), footer/divider (.75rem).

Below (1024px), the introduction heading becomes (2.25rem). Below (768px), it becomes (2rem / 16ch), the `h1` becomes (1.5rem), and introduction prose becomes (.875rem).

## Layout

Header, main, and footer share the centered `--app-content-max-width` (80rem / 1280px), with safe-area-aware side gutters of at least (1rem). The inner header has a minimum height (56px): small official logo at left, existing back/theme controls at right. The shell uses the application-height utility and browser/Telegram content safe areas.

Desktop pairs a flexible introduction with a sign-in column capped at (440px), with the wide column gap. Main content centers vertically when space permits, with block padding (56px). Footer minimum height is (72px); expanded states use normal page scrolling.

| Viewport condition | Behavior |
| --- | --- |
| Below 1024px (`max-width: 1023px`) | Compact column gap, panel column capped at 400px, panel padding 28px. |
| Below 768px (`max-width: 767px`) | Single column capped at 440px; sign-in first, introduction second; main block padding 32px, panel padding 24px. At 768px, two columns remain. |
| At or below 640px | Smaller header action gap, 44px square theme control, centered wrapping footer. |
| At or below 359px | Panel padding 20px; panel help link takes its own line. |

**The Sign-In First Rule.** DOM/assistive-technology order is always panel then introduction. Desktop CSS places introduction left and panel right; mobile follows DOM order. Preserve the skip link, focusable main region, and single `h1`.

## Elevation & Depth

The panel is flat, separated by card tone and a thin border. Provider/recovery wells use tonal contrast. Shared outline controls retain their hover, focus, disabled, and pressed states. Auth adds no shadow or entrance animation. The pending spinner stops rotating with reduced motion.

## Shapes

Panel and notice radii are recorded above. Shared buttons inherit `--radius` (currently .875rem). The theme control is circular, (36px) square above the mobile breakpoint. Preserve the official logo shape and small functional Lucide icons.

## Components

Use the shared [Logo](../../components/brand/logo.tsx), [BackLink](../../components/navigation/back-link.tsx), and [ThemeToggle](../../components/theme/theme-toggle.tsx), including persistent theme and browser/Mini App back behavior. Marketplace/help links and account-switch disclosure retain visible keyboard focus.

[TelegramLogin](../../components/auth/telegram-login.tsx) embeds the real legacy widget (`large`, corner radius 12) in a centered well with minimum height (56px) and constrained width. Iframe typography, account display, and native errors remain provider-owned. [GoogleButton](../../components/auth/google-button.tsx) uses the shared full-width outline control and provider SVG; it and the divider appear only with `NEXT_PUBLIC_GOOGLE_CLIENT_ID` configured.

A missing-widget callback shows a status with retry/help; retry remounts the widget. Suggest Google only when configured. An existing iframe displaying `Bot domain invalid` is a separate cross-origin state. The website host must be linked to the configured bot through BotFather `/setdomain`, per [official legacy-widget domain setup](https://core.telegram.org/widgets/login-legacy#linking-your-domain-to-the-bot); localhost/tunnel previews may retain that error until configured.

Authentication errors precede actions in an alert with wrapping text. Pending authentication exposes a status, makes Telegram inert/busy, and disables Google. The [account-switch hint](../../components/auth/telegram-switch-hint.tsx) is a native `details` disclosure after providers, with a top rule and a minimum-height (44px) summary. Existing server actions, verified-user redirects, safe `from` handling, cookies, and access requirements remain the auth contract.

## Do's and Don'ts

- **Do** inherit shared tokens, Inter, logo, safe areas, and the rail; preserve sign-in-first reading order, keyboard focus, and scrolling for expanded states.
- **Do** retain real provider states and configure available-provider copy honestly.
- **Don't** introduce an auth palette, typeface, raster decoration, or global identity rule, or overwrite another route's design record.
- **Don't** simulate successful sign-in, hide native iframe errors, or change auth/permission contracts in a visual edit.

The [verification record](../../../docs/superpowers/plans/2026-10-29-auth-login-redesign.md#verification-evidence) covers light/dark at (1470, 1366, 1280, 1024, 768, 640, 390, 320px), plus expanded mobile error help. It records no horizontal overflow or clipped controls; geometry measurements followed viewport settlement and preceded full-page capture. These are emulated viewport checks, not physical-device tests.
