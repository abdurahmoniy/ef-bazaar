# Chat trade payment

Approved behavior: keep buyers in chat, explain the trade amount, available wallet balance and shortfall before an action. A funded buyer explicitly pays and starts the trade. An underfunded buyer explicitly creates a top-up, sees transfer instructions in the dialog, and confirms the trade separately after funding.

Implementation:
- Add regression coverage through TradePanel for funded/underfunded buyers, paid invoices, recovery, failures, expiry, duplicate clicks, and other participant/trade modes.
- Add a focused TradeAcceptPayment component using the existing InvoicePanel, useInvoiceWatch and payment client. Reuse an active invoice; never create one just by opening or accepting an offer. Refresh wallet on return from a banking app and after payment. Handle the 1,000 so‘m deposit floor explicitly.
- Route smart buyer offers with a payable amount into that component. Keep human-admin, pure swap and seller acceptance semantics. Remove buyer redirects to the wallet.
- Verify chat, payment and invoice-watch regression suites, type checking and targeted lint. Preserve earlier uncommitted trade fixes.

Payment credit never automatically accepts the offer. The server remains authoritative for balance and proposal expiry. An expired offer cannot be funded or accepted from this dialog; any existing transfer remains visible with a warning that a new offer is needed. Card data is rendered only by InvoicePanel and is never persisted in browser storage.

Verification: regression tests cover both funding states, paid-invoice continuation, recovery, expiry, replaced offers, request failures and duplicate clicks. A mocked browser preview at 390px verified transfer instructions, scrolling and return to explicit confirmation. The shared InvoicePanel has an optional compact layout for readable card digits inside the chat dialog.
