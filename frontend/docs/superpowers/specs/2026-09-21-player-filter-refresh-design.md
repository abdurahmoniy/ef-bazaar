# Player filter refresh

Approved direction: focused redesign of the marketplace O‘yinchilar dialog, retaining its blue/gold theme, META/Search tabs, card matching, and feature-gated saved team.

- Clear title and short instructions; segmented tabs and legible cards with corner selection badges.
- Selected-player strip above the catalogue with a live count out of eleven and individual remove actions. It persists across META/Search; saved-team mode retains its own selection.
- Compact, expandable matching settings, readable Uzbek descriptions, and a persistent primary action. Preserve exact incoming strictness until the user changes it.
- Clear affects the local draft only. Applying an empty draft removes an existing player filter; cancelling restores the applied selection next time.
- Maintain keyboard focus management, Telegram Back/haptics, safe areas, reduced motion, and responsive light/dark layouts.

Validation: interaction tests for cross-tab removal, draft clearing and cancellation, and explicit application of an empty draft; existing marketplace tests, type checking, scoped lint, and browser layout checks.

## Density refinement

User requested a more compact window with smaller items. Load 28 cards per batch in both META and Search, with four card columns on phones and seven from the small breakpoint upward. Loading placeholders use the same count and columns, so full batches form complete rows. Reduce card padding, names, badges, header spacing and desktop dialog height. Keep selection review in a single horizontal row and retain touch-sized action targets.

## Infinite pagination

META and Search automatically append the next batch of 28 when the catalogue end enters view. Show a compact loading status, retain loaded cards on failure, and retry the failed page explicitly. Disconnect observation while loading, after one trigger, on errors and when the list ends. An empty response also ends pagination even if its total is stale. Retain a manual load fallback only for browsers without IntersectionObserver.

## Selected-card thumbnails

Replace the selected-name chips with small portrait card thumbnails in 44×48px remove buttons. Keep the count, horizontal overflow and Clear action. Names remain available in accessible labels and hover titles, with a tiny text fallback for missing or failed images.
