# Player Match Experience Design

## Goal

Make valuable-card and Dream Team search understandable, accessible, state-preserving, and useful on the marketplace’s default mobile grid experience.

## Entry points and terminology

The marketplace retains the highlighted META launcher. Its accessible label becomes “Player card search,” while the visible compact label may remain “META.” Opening it presents three buyer intents:

- **META cards:** browse curated effective META cards without typing;
- **Search:** find a specific card by name;
- **Saved teams:** apply a signed-in user’s Dream Team.

Copy distinguishes catalogue search from account matching. “Fuzzy name search” concerns typing. “Alternate card match” means the account has another card for the same canonical player.

## Accessible dialog

The hand-built fixed overlay is replaced with the installed Radix Dialog and Tabs primitives. The component provides:

- focus transfer into the dialog and restoration to the launcher;
- focus trapping, Escape dismissal, labelled title and description;
- at least 44px pointer targets for launcher, close button, tabs, cards, and footer actions;
- `aria-pressed` or Radix selected-state semantics for card and saved-team choices;
- an `aria-live="polite"` region for selected count, loading failure, and result-count feedback;
- reduced-motion variants for pulse, sheet, and skeleton effects;
- explicit retry actions when cards or saved teams fail to load.

The bottom-sheet presentation remains on phones and the centered dialog remains on larger screens. The footer stays visible above device safe areas.

## Selection and strictness

Selected cards persist while switching between META and Search tabs. Selecting a saved team replaces the ad hoc selection only after an explicit tap. Reopening the dialog always reflects the active URL criteria, not abandoned local edits.

Duplicate canonical players are disabled with an explanation even when another card version is visible. In the Dream Team editor, the star is labelled “Priority — counts 3×,” never “must have.”

Strictness is displayed from 1 to 10 with three anchor labels:

- 1–3: Flexible;
- 4–6: Balanced;
- 7–10: Strict.

Persistent helper text states: exact card gets full credit, another version gets partial credit, and priority players count three times. Default strictness is 4. Level 1 says “show any overlap.”

The Apply action includes a debounced result preview when selection is valid: “18 accounts found.” A preview failure does not erase selection and offers Retry.

## Active marketplace state

After applying, an active-match summary appears above results with:

- up to three card thumbnails plus overflow count;
- saved team name when applicable;
- strictness label and numeric value;
- Edit and Clear actions.

A single query-state utility becomes the source of truth for marketplace links. Grid/list toggles, quick chips, sidebar/mobile filters, sorting, pagination, top search, and listing links mutate only the parameters they own and preserve match criteria. Applying a new match resets page to zero. Clearing player matching removes only match parameters.

The mobile filter badge counts player matching as one active filter. A parsed strictness of 1 must remain 1; falsy numeric fallback must not convert it to the default.

## Result explanation

Both grid and list cards show a textual badge such as “73% match.” Colour supplements but does not replace the text. Opening or expanding the explanation shows:

- “4 exact cards”;
- “2 alternate versions”;
- “5 missing players.”

Default grid placement avoids collision with division, sold, and like overlays. Listing detail preserves the criteria in its back link and presents the same breakdown near the valuable-card section.

When nothing passes the current strictness, the empty state is match-specific. It names the active strictness and offers one-click recovery to the next useful lower level, Edit players, and Clear player search. It does not show the generic “create the first listing” message.

## Dream Team persistence

Signed-out users can build a local draft. Save presents a login action with a `from=/dream-team` return path, and the draft survives the authentication round trip in session storage. Successful create/update replaces local state with the server response. Navigating away or dismissing an edited team prompts before discarding unsaved changes.

Saved-team previews identify the active team when the URL criteria exactly match it. Editing a saved team does not silently rewrite an already shared marketplace URL.

## Component boundaries

- `marketplace-query-state`: parse, mutate, and serialize all marketplace parameters.
- `player-match-criteria`: frontend types, strictness labels, legacy compatibility parsing.
- `PlayerFilterDialog`: orchestration and accessible dialog state.
- `PlayerCardResults`: paginated/loading/error catalogue presentation.
- `PlayerMatchSummary`: active criteria above results.
- `MatchBadge` and `MatchBreakdown`: compact and detailed explanation.
- `DreamTeamEditor`: team editing and local/authenticated persistence.

These boundaries keep URL behavior, network behavior, and presentation independently testable.

## Testing

- Unit tests cover query preservation and mutation for every marketplace navigation.
- Component tests cover dialog focus, Escape, tab selection, disabled duplicate players, loading errors, retries, and `aria-live` feedback.
- Tests pin strictness 1, default 4, priority copy, and URL rehydration.
- Listing-card tests verify badges in both variants and non-colour breakdown text.
- Empty-state tests verify lower-strictness recovery preserves unrelated filters.
- Dream Team tests cover duplicate prevention, unsaved-change confirmation, signed-out draft restoration, and successful save.
- Responsive browser checks cover 375px portrait, phone landscape, tablet, and desktop in both themes and reduced-motion mode.

## Acceptance criteria

- No marketplace control unexpectedly clears an active player match.
- The default grid explains why every matched listing was returned.
- Dialog use is complete by keyboard and screen reader.
- Empty results always provide a recovery path.
- Signed-out team work is not lost at login.
