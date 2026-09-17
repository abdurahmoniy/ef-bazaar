# Telegram forwarder

The user selected a one-button local Mac tool that forwards the latest Saved Message through their personal Telegram account to every joined group. This includes archived groups and excludes private chats, broadcast channels, and groups they have left. There is no schedule.

Use a standalone Python utility in `tools/telegram-forwarder`, separate from the marketplace application. A double-clickable launcher installs its pinned dependency in an isolated environment, performs interactive local sign-in, then opens a loopback-only browser page. Telegram credentials and the session stay in an ignored directory with restrictive permissions. No credentials are requested in the conversation.

The page shows the latest post, recipient list, one send button, progress, individual results, and a stop button. If the newest item belongs to an album, forward the complete album in order. Refresh the snapshot before sending; if the post or recipients changed, update the preview and require another click. A single-use preview token and a running guard prevent duplicate submissions. Refreshing explicitly prepares another run, including another deliberate forwarding of the same post.

Forward sequentially, obey Telegram flood and slow-mode waits, and allow stopping during waits. Continue past explicit per-group permission failures. Stop the batch on account restrictions or uncertain network outcomes, because retrying an uncertain send could duplicate it. Never send automatically on launch, login, refresh, or restart. A stop cannot recall messages already sent or cancel a request already in flight.

Verify the selection, album handling, stale previews, concurrency, waits, cancellation, failure handling, and local HTTP access controls with automated tests. Exercise the actual browser interface with fake data only. Real sending remains unverified until the user signs in and uses the button.
