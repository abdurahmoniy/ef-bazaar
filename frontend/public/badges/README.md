# Division badge assets

`DivisionBadge` (`src/components/marketplace/division-badge.tsx`) renders
`<img src="/badges/division-{level}.png">` where `level` is 1, 2, 3, or 4.

Save the four eFootball League badge images here:

- `division-1.png` — top tier (red/blue shield)
- `division-2.png` — orange/purple shield
- `division-3.png` — teal/green shield
- `division-4.png` — blue shield (covers divisions 4 and above)

Recommended: square PNGs, transparent background, ≥ 128×128 px so they stay
crisp when the badge picker renders them at 56 px and the listing detail
header at 54 px. `.webp` or `.svg` also fine — update the extension in
`DivisionBadge` if you switch formats.
