# Proposal card consistency

Scope approved in the chat: fix contradictory proposal status, unrelated trade navigation, incorrect historical amounts/types, and oversized indistinguishable cards.

1. Add regression coverage for stale/missing outcomes, unrelated current proposals/trades, zero versus invalid amounts, exact trade selection, and participant actions.
2. Persist optional proposal kind, listing ID, expiry, and accepted trade ID on marketplace messages through the existing trade events. Preserve compatibility with older events/messages; never guess an old trade association.
3. Resolve card status and details from that message or its exact matching pending proposal. Use one resolved status for the badge and controls. Preserve explicit terminal outcomes. Unverified historical pending messages get a neutral unavailable status.
4. Add explicit trade selection to the chat drawer; opening a proposal's trade must not open the chat's unrelated active trade. Keep the default pinned-bar/current-trade behavior.
5. Compact cards, add verified listing links, and use neutral amount text when data is invalid.
6. Run focused frontend regression tests, typecheck/lint, and backend tests/build where the local runtime permits. Review the final diff.

Legacy messages lack persisted proposal details and cannot be reliably backfilled from the current chat state. Their original numeric amount remains usable (zero indicates an exchange); unknown status/details are shown honestly and unverified trade links are omitted.
