# Firebase push and mobile notification access

Status: approved and implemented; deployment configuration and real-device delivery checks remain operator steps.

## Problem and evidence

The marketplace notification bell is inside a `hidden ... sm:flex` container in `src/components/marketplace/marketplace-shell.tsx`. The home page also hides its entire utility cluster below the small breakpoint. As a result, the bell is unavailable on phone-sized marketplace screens. The header is sticky only on desktop. The existing notification page at `/notifications` already supports authenticated users.

`NotificationBell` polls unread counts every 30 seconds. The backend marketplace service persists notification rows, but the inspected frontend and backend contain no Firebase messaging integration or device-token registration endpoints.

## Recommended approach

Deliver both a visible mobile notification entry and Firebase Cloud Messaging push delivery. A UI-only change would fix discovery but would not alert users outside the website. Push-only integration would leave the hidden notification entry unresolved.

### Mobile access

- Show a bell with an unread badge and a minimum 44px touch target in the mobile marketplace header, including the home page.
- Keep the compact header accessible while scrolling; account for existing Telegram safe-area variables.
- On mobile, the bell opens the existing full notification page. Keep the desktop dropdown.
- Preserve the current five-slot bottom navigation to avoid crowding narrow phones.
- Keep notification access available in the existing chat list header.
- Add a clearly labeled push opt-in control to the notification page, with pending, enabled, denied, unsupported, unavailable-configuration, and failed-registration states. Use the application's Uzbek language conventions.

### Firebase client

- Initialize Firebase messaging only in supported browser environments with complete configuration.
- Ask for browser notification permission only after the user selects the opt-in control.
- Register a messaging service worker, obtain an FCM token with the project's public VAPID key, and register it against the authenticated user.
- Refresh the unread count and notification list on foreground messages without duplicating browser notifications.
- Handle background notifications and route taps to the relevant notification destination. Validate destinations against application routes and the existing trusted webmail origin.
- Reconcile token registration after login and remove the user's device association on logout or explicit disable. Prevent a shared browser from retaining the previous account's push subscription.
- Preserve existing in-app polling when push is unavailable. Give iPhone users Home Screen installation guidance when required, and show capability-based fallback messaging in embedded browsers.

### Backend delivery

- Add authenticated, idempotent device-token registration and removal to marketplace-service. Derive the user ID from the authenticated principal, never the request body.
- Persist device ownership and support multiple devices per user. Reassign tokens safely when a shared device changes accounts.
- Send FCM messages for committed notification creation and coalesced chat-message updates; avoid sending notifications for rolled-back transactions.
- Reuse existing notification types and destination semantics. Include a stable notification identifier for replacement and deduplication.
- Keep delivery failures separate from the business transaction; log delivery failures without exposing tokens, and remove permanently invalid tokens.
- Keep Firebase server credentials server-side. Do not put service-account credentials in public frontend environment variables.

## Configuration required for live delivery

Deployment needs the Firebase web application configuration, public Web Push/VAPID key, enabled Cloud Messaging API, and server-side Firebase credentials from the same project. Document environment variables with placeholders; do not invent credentials or claim live delivery without a real-device check.

## Verification

- Check marketplace and notifications at 360px, 390px, and desktop widths; verify badge visibility, readable labels, keyboard focus, and unobstructed content.
- Exercise granted, denied, unsupported, missing-configuration, registration-failure, logout, and account-switch behavior.
- Verify authenticated token ownership and invalid-token cleanup in backend tests.
- Verify both new notification rows and updated coalesced chat notifications trigger delivery after commit.
- Run relevant frontend tests, type checking, linting, and backend tests.
- With deployment credentials available, send a real notification to an Android browser and an installed iPhone web app; verify foreground refresh, background delivery, and tap navigation.

## References

- Firebase setup: https://firebase.google.com/docs/cloud-messaging/web/get-started
- Firebase message handling: https://firebase.google.com/docs/cloud-messaging/web/receive-messages
- Apple mobile web push requirements: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
