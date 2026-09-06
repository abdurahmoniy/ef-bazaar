# Mobile listing advertising

The user requested implementation of easier paid partner-channel advertising during creation/editing and owner-only discovery on detail and listing screens. Continue within that authorization using the existing brand and Telegram shell.

## Chosen journey

Use a dedicated owner-only `/marketplace/[id]/advertise` page, rather than a nested payment modal or another fixed bar on the listing. It has one channel-selection → price review → explicit order journey. Preserve Telegram Back, existing content safe areas, one native MainButton controller, and a reachable in-page action. Ordinary page browsing and keyboard input remain usable on small phones.

During creation, show an optional advertising offer after the price controls, before the longer fee explanation, a channel selector when opened, and a summary at the top of listing review. Save the listing without `channelIds`, then continue to advertising with the selected channel IDs. A complete selection opens the live price review directly; an empty or unavailable selection opens the chooser. The button says that advertising is the next step; creation does not itself order advertising. Editing offers save-and-continue from the review step; remove the separate purchase section below the wizard that competes with its controls. Unsaved edits must be saved before advertising uses them.

Add a clear promotion entry near the top of owned active listing details and a full-width action on My listings cards. Buyers, favorites, sold listings and deleted listings get no advertising action. Direct access checks owner and active status on the server before rendering purchase UI.

## Selection and money

Channel rows show title, subscriber count, and price with so‘m or Bepul. Full rows are touch targets with a visible selected state. Search never removes selected items from the total. Keep selected channel objects outside filtered results, list removable selections, and provide loading, empty-search and retry states. Use 16px mobile search inputs and existing semantic color tokens with readable dark accents.

Preserve fractional channel prices to two decimal places, matching the channel database precision. Sum prices and compare wallet funds in integer tiyin so an exactly funded balance is accepted. Round only the suggested top-up amount up to a whole so‘m, matching the existing wallet input.

The advertising page loads catalogue, wallet and delivered history. Review shows individual channel prices and total, repeat-publication information, wallet balance/shortfall, and clear payment wording. Revalidate current catalogue and wallet before mutation; changed prices return to review and unavailable channels require correction. Top-up links preserve selection and return to this page. Price display is not a backend quote; backend price races cannot be eliminated in frontend scope.

Lock submission synchronously and never automatically retry a payment/order mutation. Current API returns an empty success response even for some funding failures. Say the request was accepted, not that payment/publication succeeded. Historical delivered count/date confirms publication; count zero does not distinguish pending from failed. Read failures can retry. Ambiguous mutation failure requires checking history/wallet and a deliberate new order flow, not an immediate resend button. Reposting is another explicit priced order; do not promise old posts are always removed.

## Verification and limits

Cover selection across searches, duplicate IDs, changed prices, empty/free channels, wallet shortfall/return, double taps, ambiguous results, confirmed history, owner/status gates and create/edit payload separation. Test Telegram MainButton/back integration with SDK mocks and inspect responsive local previews in light/dark themes and short-height views. Actual Telegram device behavior and production publication/payment must not be claimed from a browser preview.

No backend changes, actual advertising purchase, deployment, billing-policy change, guaranteed views or sales are included. Backend follow-up: quote/version enforcement, idempotent order identifiers, explicit funding/publication status and resumable pending orders.

## Review and local preview evidence

Independent reviews checked owner gates, selection ownership, save/order separation, live price and wallet checks, native/HTML duplicate taps, status-refresh races and money precision. Findings about a synchronous refresh race, decimal price display, floating point affordability, and the low position of the advertising offer were fixed and verified.

Browser previews used an isolated local sample API and a production build, with no real funds or Telegram publication. Inspected 360×740, 390×844, 390×420, 768×1024 and 1280×900 layouts in light and dark themes. Checked:

- Selection persists across search and totals include all selected channels.
- The mobile choose action remains visible at short heights. Its measured 133px footer reserves the same space in the page and clears when entering review; the primary button measures 44px tall. Form save actions measure 48px.
- Long channel names and six-digit prices wrap without horizontal page overflow at the inspected widths.
- A price change from 17,000 to 20,000 so‘m returns to confirmation with zero sample orders. Explicit confirmation then reaches an accepted result without falsely claiming publication.
- An interrupted response followed by a status refresh leaves the sample order count at one.
- A 17,000 so‘m selection with a 1,000 so‘m wallet opens the wallet with 16,000 prefilled and both channel IDs retained in the return URL.
- Active owners see advertising near the top of detail and beneath My listings cards. Nonowners and sold-listing owners are redirected away; guests retain the intended selection in their login destination.
- Editing with one selected channel saves and continues with that channel retained; the sample advertising order count remains zero.

Telegram behavior is covered by SDK-mock tests for native action registration/cleanup, duplicate taps, Back and shell safe areas. Browser resizing does not verify a physical Telegram client, its actual keyboard or nonzero device insets. Followed the official [Telegram Mini Apps design guidance](https://core.telegram.org/bots/webapps#design-guidelines).
