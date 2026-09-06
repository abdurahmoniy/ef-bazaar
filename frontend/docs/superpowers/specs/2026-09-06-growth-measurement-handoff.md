# Invitation and partnership rollout notes

## What this frontend measures

The existing Yandex Metrica integration receives optional JavaScript goals through `trackGrowth`. A blocked or missing analytics script never blocks a product action. Event details contain placement, sharing method or application state; no names, user IDs, referral codes, URLs or balances are supplied by these new calls.

| Event | Meaning | Interpretation |
| --- | --- | --- |
| `invite_impression` | At least half of an invitation card enters the viewport | Card exposure, once per mounted card; not a unique person |
| `invite_open` | An invitation entry is clicked | Compare placement performance, with appropriate exposure denominators |
| `invite_view` | Invitation screen mounts | Arrival; data may still be loading |
| `invite_dismiss` | A dismissible promotion is closed | Session dismissal; permanent Profile access remains |
| `invite_share_intent` | Telegram is opened or invitation copying is attempted | Not evidence that a message was sent |
| `invite_copy_success` | Clipboard write succeeds | A copied link is not evidence of delivery |
| `referral_claimed` | API explicitly accepts the pending referral claim | Best-effort client event; use backend attribution for authoritative counts |
| `partnership_view` | Public/authenticated partnership screen mounts | Includes guests and returning applicants |
| `partnership_open` | Owner offer or a start/sign-in action is clicked | Use placement and state to separate the entry points |
| `partnership_apply` | Application creation succeeds | Accepted application, not approval |
| `partnership_channel_open` | Applicant opens Telegram to add the bot | Not proof that channel verification succeeded |
| `partnership_price_saved` | Posting price update succeeds | Distinguishes intentional free or paid pricing without sending the amount |

Configure these goal names in the existing analytics account before relying on reports. That external configuration is not part of this frontend patch.

## Decisions after release

Use existing backend records for the friend funnel: accepted attribution → new account → first successful trade → credited reward. For partnership, follow application → verified channel → paid fee → approval → chosen posting price → first published post. The frontend does not invent events for outcomes it cannot verify.

Start with a baseline by device size and entry placement. Compare completed referrals per eligible active user, first successful trade conversion and activated channels, alongside marketplace listing views and successful trades. Avoid optimizing button clicks alone.

Test one change at a time after there is enough traffic: marketplace invitation copy, the timing of the completed-trade prompt, or partner hero wording. Preserve reward conditions and report uncertainty rather than promising a specific percentage uplift. Watch dismissal rate, returning-user irritation, failed linking, support requests, approval rate and paid-channel post volume.

A small usability check should include ordinary phone users and actual channel owners. Ask an ordinary user to find the invitation, explain when the reward arrives, and share a listing. Ask an owner to identify the posting income, fee and next application step. Record task completion and misunderstandings; no such user study has been performed by this patch.

## Backend and operating limits

- Reward amounts, minimum subscribers and fees remain controlled by existing APIs. Guests get an explanation of the mechanisms; signed-in users see current terms.
- Referral HTTP/network/auth failures retain the pending code and retry. The frontend cannot distinguish a backend outage that is incorrectly returned as an ordinary successful `claimed: false` business response.
- Approval currently activates channels at a zero posting price. The frontend highlights this and requires an explicit free-price choice when saving zero. Preventing any free exposure before initial setup needs a backend activation rule.
- Existing payment-before-review and cancellation behavior is disclosed. This patch does not change fees, refund rules, review timing or payout eligibility.
- No deployment, real Telegram message, production payment, analytics-account change or live experiment was performed.
