# Mail visibility after ownership transfer

The new owner must not inherit previous owners' emails. A trade handoff grants mail received from the current trade's start onward; an assignment outside a trade grants mail received from assignment onward. Use IMAP INTERNALDATE, never the sender-controlled Date header. Retain server data for authorized platform-admin access.

- Persist `owner_mail_visible_from` with ownership, independently of credentials and password rotation.
- Pass the current trade's start for sales, both exchange sides, returns, and assigned trade admins.
- Enforce the boundary for inbox pagination/totals, unread/last activity, message detail, attachments, and marking read. Deny hidden direct message IDs as not found.
- Backfill existing rows conservatively; recover a trade boundary only where ownership and audit evidence match the handoff. Include successful, rejected, timed-out returns and accepted active human trades.
- Validate with mocked IMAP regressions and real PostgreSQL migration/ownership tests. Keep Docker test support unchanged in delivered code; a temporary local database substitutes for unavailable Docker during local verification.

No deployment or deletion of emails is part of this change.

## Verification

Implemented and independently reviewed. All 46 focused tests passed: 8 IMAP visibility tests, 4 existing ownership tests, 24 mailbox service tests, 5 PostgreSQL ownership/migration cases, and 5 trade-handoff cases. Migration fixtures cover success, rejection, timeout returns, both exchange sides, active trade admins, and later manual reassignment. Tests used Java 21 and isolated PostgreSQL 18 because Docker was unavailable; temporary test-datasource changes were not delivered. The 10 backend files applied to the workspace match the tested files byte-for-byte. `git diff --check` passed. The temporary database server was stopped. No live IMAP server or deployment was exercised.
