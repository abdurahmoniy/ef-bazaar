# Navigation and conversation polish

The requested experience is fast, smooth page navigation and a familiar Telegram-style conversation, within the existing eFBazaar identity and Uzbek interface.

- Use a brief, interruptible 240ms arrival animation on page content. Direction follows bottom-tab order and parent/detail navigation. Keep headers and bottom bars still; preserve Next navigation, history, prefetch and scroll behavior. Skip initial loads, same-path updates and reduced-motion preferences.
- Share the mobile bottom navigation between marketplace pages and the chat inbox. Hide it inside conversations. The active pill slides to the selected tab and links give immediate pending feedback.
- Keep the desktop messenger split layout. Make inbox names, previews and unread counts easier to scan, with accessible search and filter controls.
- Group consecutive messages from the same sender within five minutes and the same Uzbekistan calendar day. Break groups at unread markers and trade proposals. Use soft conversation backgrounds, rounded incoming/outgoing bubbles, in-bubble metadata and a rounded composer.
- Preserve replies, editing, attachment actions, voice recording, trade sheets, localization, keyboard resizing and scroll-follow behavior. Presence and read receipts are not available in the API and must not be fabricated.

Verification covers motion direction/cancellation/reduced motion, message grouping boundaries, existing chat and viewport regressions, type checking, lint and browser inspection at phone and desktop sizes.

## Follow-up: navigation caching

- Opt marketplace list/detail and chat list/detail into 30-second browser route reuse with Next's page-level `unstable_dynamicStaleTime` (verified in the locked 16.2.9 version). Leave wallet, admin, profile and forms at the default policy. Server API requests remain `no-store`; browser history restoration follows Next's existing behavior rather than a hard 30-second expiry.
- Keep private chat queries in account-scoped memory for ten minutes after their last observer leaves. Messages/inbox become stale after five seconds and revalidate on revisit/focus; active polling pauses in hidden tabs. No private data is persisted to browser storage.
- Opening a conversation marks reads and invalidates only related inbox/unread queries. Confirmed message mutations cancel earlier polls before updating cached data. Server snapshots carry request timestamps and completeness so old or partial responses cannot erase newer/full conversations.
- Clear other accounts' private queries on a confirmed identity change. Loading skeletons explicitly leave the existing identity alone. Recheck older pages when the app resumes and invalidate visited listings after successful favorite changes.

Caching verification covers request deduplication, conversation revisits, account isolation, stale poll cancellation, partial server snapshots, read counters, favorite invalidation, and resume revalidation.
