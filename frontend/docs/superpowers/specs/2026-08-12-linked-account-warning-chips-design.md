# Linked Account Warning Chips Design

## Goal

Present linked Google Play and Game Center accounts as transfer risks on compact marketplace listing cards.

## Approved presentation

- Render one separate amber warning chip for each linked service.
- Add a small warning triangle and explicit copy: `Google Play ulangan` or `Game Center ulangan`.
- Use semantic warning colors through the existing accent tokens: amber-tinted surface, amber border, and high-contrast warning text in light and dark themes.
- Allow the chips to wrap when both are present so the two-column mobile card never overflows.
- Render a chip only when the corresponding backend attribute is exactly boolean `true`; render no linked-service block when neither is linked.

## Accessibility

Risk is communicated through the warning triangle and `ulangan` text, not color alone. Google and Apple brand images are intentionally omitted to keep the chips compact.

## Scope

Only the marketplace feed card linked-service presentation and its regression tests change. Coin facts, price, exchange type, detail pages, backend attributes, filtering, and listing forms remain unchanged.

## Verification

- Component tests cover one linked service, both linked services, neither linked, and non-boolean truthy values.
- Full tests, TypeScript, lint, and diff checks must pass.
