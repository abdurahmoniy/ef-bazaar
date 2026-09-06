# Invitations and channel partnership UX

Approved direction: the user's September 6 instruction to implement the preceding UX audit in full, step by step.

## Product behavior

- Friend invitations are the primary growth action for ordinary Uzbek-speaking users. Preserve the five existing mobile navigation destinations. Add a permanent Profile card, a labeled desktop shortcut, a compact dismissible marketplace promotion, wallet access, and public homepage/footer links.
- Keep channel-owner acquisition secondary and explicitly labeled for Telegram channel owners. Add a public recruitment explanation, supported earning mechanisms, a sample post, prerequisites, and an authenticated application action. Current partners go to their existing panel.
- Invitation sharing has one primary Telegram action and a visibly labeled copy fallback. Explain that the inviter earns the configured amount only after the friend's first completed trade. Never promise a signup reward, a reward for both parties, or immediate cash withdrawal.
- Keep personal invitation statistics, improve their labels, support loading/error/retry/copy fallback, and retain familiar back and wallet navigation.
- Referral claims survive temporary HTTP/network/auth errors and retry without clearing attribution. Existing successful or definitive business rejection responses may clear the code. Preserve current attribution precedence; test friend and channel link combinations.
- A recipient can understand that an invitation was received without exposing private referrer details or blocking browsing. No contact upload or automatic messages.
- Partner application steps advance only in order. Visitors see benefits before sign-in; authenticated users see live terms. Loading failure offers recovery. Canceled/rejected applications must not appear successfully completed. Refresh external verification/review on returning to the page.
- Explain existing fee/payment ordering and refund limitations without inventing review times, guaranteed earnings, or business policies. Make zero posting price visible and give the owner an explicit setup action; the frontend cannot prevent backend activation at zero.
- Add a restrained prompt after actual completed trades and contextual listing sharing. Existing generic analytics may receive non-identifying growth events; opening Telegram is a share intent, never proof of a sent message. Count backend-owned outcomes only when supported, without inventing a conversion dashboard.

## Scope and limits

Frontend implementation only. No changes to payment amounts, backend eligibility, attribution ownership policy, application approval rules, or production configuration. Do not make public terms by using privileged credentials. Public copy can explain mechanisms; authenticated settings show actual rates. Live A/B results, external analytics goal setup, real channel onboarding and research with real users are follow-up operating work, not claims made by this patch.

## Acceptance

At phone widths invitations and the owner offer are reachable from Profile without the hidden avatar menu. The marketplace promotion fits with listings still visible. Guests can read the partnership offer without Access Denied. Signed-in sharing supports success, cancellation, denied clipboard and retry. Transient claim failures retain the code. Application actions respect current state. Existing marketplace navigation and trades continue to work. Verify unit/component behavior, types, lint, production build, small-phone/desktop layouts, keyboard controls and independent code review.
