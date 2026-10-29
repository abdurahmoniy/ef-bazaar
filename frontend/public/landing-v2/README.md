# Landing v2 assets

- `legends.png`: original image supplied by the user for this landing-page concept. Duotone and print-dot treatment are CSS effects; the source pixels are preserved.
- `fonts/big-shoulders-display-latin.woff2`: Big Shoulders Display, downloaded from the Google Fonts URL used in the supplied HTML concept. SIL Open Font License in `fonts/Big-Shoulders-Display-OFL.txt`.
- `fonts/inter-tight-latin.woff2`: original concept reference font, retained unchanged with its SIL Open Font License. The app now uses the shared Inter body font instead.

The route serves the display font locally and reuses the root app’s Inter configuration for body/UI text. It does not execute scripts from the supplied concept.
