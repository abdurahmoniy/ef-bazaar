# Admin Chat Listing History Implementation Plan

> **For agentic workers:** Use inline execution and request a focused code review after implementation.

**Goal:** Show the listing that opened an admin-viewed conversation and insert subsequent listing selections after the message preceding each selection.

**Architecture:** Read existing account-request history through a new admin-only GET endpoint. Attach a preceding message ID to each selection so pagination cannot drop or duplicate cards between message pages. Fetch listing summaries in one batch, including sold and soft-deleted listings. The frontend merges these events into the existing read-only transcript.

**Tech Stack:** Spring Boot/JPA, Next.js/React, JUnit/Mockito, Vitest.

## Backend

- [x] Extend `ChatAccountRequestRepository` with `findByChatIdOrderByCreatedAtAscIdAsc(UUID chatId)`.
- [x] Extend `ChatMessageRepository` with a deterministic admin page query ordered by `createdAt DESC, id DESC`, and `findFirstByChatIdAndCreatedAtLessThanEqualOrderByCreatedAtDescIdDesc(UUID chatId, Instant createdAt)` to anchor a selection to a concrete message.
- [x] Add `AdminChatListingEventResponse`: event ID, listing ID, requester ID, selection timestamp, preceding message ID, initial flag, listing summary (title/description, price, cover image, status).
- [x] Add `AdminChatService.listingHistory` and `GET /api/v1/admin/chats/{id}/listing-history`. Read all request statuses; retain repeated A→B→A selections. If no request history exists, use the chat's original listing as a beginning event. Do not pretend a late first saved request was the original listing.
- [x] Verify ordering, sold/deleted summaries, absent summaries, original fallback, unknown chat, admin access, and no writes. Run `AdminChatServiceTest` and `AdminChatControllerTest` using Java21 in a temporary service copy, then apply tested files to the backend.

## Frontend

- [x] Add the response type and server GET wrapper in `src/lib/chat-admin-types.ts` and `src/lib/chat-admin-server.ts`.
- [x] Add `buildAdminChatTimeline` in `src/lib/chat-admin.ts`: reverse the newest-first message page, insert null-anchor events only on the oldest page, then append each message's anchored events in order. Message and listing keys use separate prefixes.
- [x] Extract the transcript into `src/components/admin/admin-chat-transcript.tsx`; show compact cover/title/price/status cards and a listing link when available. Keep message attachments, replies, proposal outcomes, party names, and day separators.
- [x] Fetch history alongside chat/messages in `src/app/admin/chats/[id]/page.tsx`; show a visible history-loading error while keeping messages readable if that request fails.
- [x] Test single/three/repeated selections, empty chat, pagination boundaries, and card rendering. Check phone and desktop layout with fixture data.

## Completion

- [x] Run relevant Vitest tests, typecheck, targeted lint, and `git diff --check`.
- [x] Request code review, address actionable findings, report deployment requirements and any limitations of legacy stored history.

## Verification results

- 14 frontend tests and 16 backend tests pass. The applied backend files match the tested temporary service copy.
- Targeted lint and `git diff --check` pass. Desktop and 390px/320px phone previews preserve the listing/message order and have no horizontal overflow.
- Full-project typecheck remains blocked by missing `firebase/app` and `firebase/messaging` dependencies and related typing errors in concurrent notification work. No admin listing-history errors were reported.
- Request-history entries use selection labels because old records cannot prove the original listing. Missing legacy history cannot be reconstructed; a chat with no selection records uses its retained listing as the opening card.
- Requires frontend and marketplace-service deployment. No database migration is required.
