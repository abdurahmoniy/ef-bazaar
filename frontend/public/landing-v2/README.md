# Landing v2 assets

- `legends.png`: original image supplied by the user for this landing-page concept. Duotone and print-dot treatment are CSS effects; the source pixels are preserved.
- `fonts/big-shoulders-display-latin.woff2`: Big Shoulders Display, downloaded from the Google Fonts URL used in the supplied HTML concept. SIL Open Font License in `fonts/Big-Shoulders-Display-OFL.txt`.
- `fonts/inter-tight-latin.woff2`: original concept reference font, retained unchanged with its SIL Open Font License. The app now uses the shared Inter body font instead.

The route serves the display font locally and reuses the root app’s Inter configuration for body/UI text. It does not execute scripts from the supplied concept.

## Share card (Open Graph / Twitter)

`src/app/opengraph-image.tsx` reuses these assets through derived files in `src/assets/og/`, because `next/og` reads neither WOFF2 nor variable fonts and cannot apply CSS blend modes or masks:

- `big-shoulders-display-600.ttf`, `big-shoulders-display-800.ttf`: static weight instances of `fonts/big-shoulders-display-latin.woff2`, made with fontTools `varLib.instancer` (`wght=600`, `wght=800`). Same SIL Open Font License.
- `poster.jpg`: `legends.png` with the hero duotone, print dots and edge fades baked in. Regenerate with `node scripts/build-og-poster.mjs` after replacing the photograph.
