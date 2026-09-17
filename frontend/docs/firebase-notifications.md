# Firebase notifications setup

The mobile marketplace header now keeps a notification bell visible while scrolling. It opens `/notifications`, where signed-in users can enable or disable push on their current browser. In-app notifications continue working without Firebase.

## Firebase project

1. Register a Web app in the Firebase project and copy its web configuration.
2. In Project Settings → Cloud Messaging → Web Push certificates, generate a VAPID key pair and copy the **public** key.
3. Enable the Firebase Cloud Messaging API and FCM Registration API for the project.
4. Give the backend a service account with permission to send Firebase Cloud Messaging messages, using Application Default Credentials. Keep its JSON file outside the repository and image. Do not put a service account JSON or private key in the frontend environment.

Official references: [web setup](https://firebase.google.com/docs/cloud-messaging/web/get-started), [receiving messages](https://firebase.google.com/docs/cloud-messaging/web/receive-messages), [Admin SDK setup](https://firebase.google.com/docs/admin/setup).

## Environment

Set these in the deployment's root `.env` (or the frontend `.env.local` for local development):

| Variable | Value |
| --- | --- |
| `FIREBASE_WEB_API_KEY` | Web app `apiKey` |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_MESSAGING_SENDER_ID` | Web app `messagingSenderId` |
| `FIREBASE_WEB_APP_ID` | Web app `appId` |
| `FIREBASE_WEB_VAPID_KEY` | Public Web Push certificate key |
| `FIREBASE_PUSH_ENABLED` | `true` on marketplace-service once server credentials are ready |
| `FIREBASE_CREDENTIALS_FILE` | Absolute path on the deployment server to the backend service-account JSON file, if using the optional Compose overlay |

The frontend reads web configuration at runtime through `/api/push/config`; these values do not require build arguments. The worker at `/firebase-messaging-sw.js` uses the installed SDK's exact version. Production CSP permits the Firebase installation and registration API endpoints and the existing Google-hosted SDK scripts.

For GitHub Actions deployment, add the variables above as repository Actions secrets. The deploy workflow forwards them to the server, and `deploy.sh` writes them into the root `.env` on each deployment. Set `FIREBASE_PUSH_ENABLED` to `true`. If `FIREBASE_CREDENTIALS_FILE` is set, deployment verifies that it is an absolute path to an existing readable file and automatically enables the credential overlay. The JSON must already exist on the deployment server; a path on your laptop does not upload the file. Keep the file outside the repository, for example `/opt/efbazaar-secrets/firebase-admin.json`.

For a manual deployment using Compose and a credential file, start the rebuilt images with the main compose file plus the optional overlay:

```sh
docker compose -f docker-compose.yml -f frontend/docs/firebase-push.compose.yml up -d marketplace-service frontend
```

The overlay mounts the credential file read-only only into marketplace-service. On environments that already provide Google Application Default Credentials through their workload identity, the overlay is unnecessary. The `FIREBASE_PROJECT_ID` must match the web app and credentials.

Flyway creates `notification_push_tokens` automatically. Push is disabled by default. The settings UI only offers opt-in when both frontend and backend configuration are enabled. No credentials have been supplied or installed by this code change.

If the enable button is missing, open `/api/push/config` while signed in. A populated `config` and nonempty `vapidKey` indicate that configuration is available. A null `config` means the frontend settings, sign-in, or backend enablement are missing; a 503 indicates a failed authentication/backend request. Permission is requested only after tapping **Bildirishnomalarni yoqish**, never automatically when opening the page.

## Delivery and account behavior

- Browser permission is requested only after a tap on **Bildirishnomalarni yoqish**.
- Device tokens belong to authenticated users. A browser can have one current account association, while each user can register multiple browsers/devices.
- The server removes the current device association during logout, before clearing authentication cookies. Client reconciliation invalidates a previous account's Firebase token on account changes. Background messages additionally validate the current session before displaying content.
- Explicit disable records an opt-out before attempting server and Firebase cleanup; failures remain retryable without silently opting the browser back in.
- Foreground messages refresh the unread badge and notification list. Background messages display one tagged browser notification. Clicking opens the corresponding internal destination; mail and moderator invitation alerts open the notification center, which applies their existing routing rules.
- Only committed notification changes enqueue push. Coalesced unread chat updates still enqueue a new push. Permanently unregistered Firebase tokens are deleted from the database.
- Delivery is best-effort through a bounded in-process queue. A restart, a full queue, or a transient Firebase failure can drop a push; the notification remains in the in-app center. This implementation does not add a durable outbox or retry queue.

## Mobile verification

Use HTTPS in deployment (localhost is allowed for local development).

1. At 360px and 390px, sign in and confirm the marketplace bell stays visible when scrolling. Tap it and confirm the full notification page opens.
2. Enable push. Denying or dismissing the browser prompt must not register a token or show an enabled state.
3. From a second account, send a chat message. In the foreground, the unread count/list should refresh. With the page in the background, a notification should appear and open that chat when tapped.
4. Send a second message while the in-app notification remains unread; it must still produce an updated push.
5. Disable push, sign out, and switch accounts; the previous account's alerts must not appear on this browser.
6. On iPhone/iPad, add the website to the Home Screen and open the installed web app before enabling push. Embedded browsers may not support Web Push and show fallback guidance. [Apple's requirements](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

Real-device Firebase delivery requires the deployment settings above; unit tests cannot establish that the live project's credentials or browser delivery work.
