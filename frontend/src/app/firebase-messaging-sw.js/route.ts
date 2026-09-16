import { getPushConfig } from '@/lib/push-config';
import { SDK_VERSION } from 'firebase/app';
export const dynamic = 'force-dynamic';

export function GET() {
  const { config } = getPushConfig();
  const script = config ? `
importScripts('/push-notifications.js');
importScripts('https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-messaging-compat.js');
firebase.initializeApp(${JSON.stringify(config)});
firebase.messaging().onBackgroundMessage(self.handleBackgroundPush);
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
` : '// Firebase push is not configured.\n';
  return new Response(script, { headers: {
    'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/',
  } });
}
