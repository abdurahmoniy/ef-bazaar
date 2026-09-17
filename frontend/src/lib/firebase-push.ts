import type { FirebaseOptions } from 'firebase/app';
import type { MessagePayload } from 'firebase/messaging';

export const NOTIFICATIONS_CHANGED = 'efbazaar:notifications-changed';
const STORAGE_KEY = 'efbazaar.push';
export type PushState = 'loading' | 'unconfigured' | 'unsupported' | 'install' | 'available' | 'enabled' | 'denied' | 'error';
export interface PushContext {
  userId: string | null;
  config: FirebaseOptions | null;
  vapidKey: string;
}

function savedSubscription(): { userId: string; token: string; disabled?: boolean } | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return typeof saved?.userId === 'string' && typeof saved?.token === 'string' ? saved : null;
  } catch { return null; }
}

export async function getPushAvailability(context: PushContext): Promise<PushState> {
  if (!context.config || !context.vapidKey) return 'unconfigured';
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone;
  if (ios && !standalone) return 'install';
  if (!window.isSecureContext || !('Notification' in window) || !('serviceWorker' in navigator) || !navigator.locks) return 'unsupported';
  const { isSupported } = await import('firebase/messaging');
  if (!await isSupported()) return 'unsupported';
  return Notification.permission === 'denied' ? 'denied' : 'available';
}

async function messaging(context: PushContext) {
  if (!context.config) throw new Error('Push is not configured');
  const [{ getApps, initializeApp }, sdk] = await Promise.all([import('firebase/app'), import('firebase/messaging')]);
  const app = getApps().find((item) => item.name === 'efbazaar-push')
    ?? initializeApp(context.config, 'efbazaar-push');
  return { sdk, instance: sdk.getMessaging(app) };
}

async function activeWorker() {
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
  if (registration.active) return registration;
  await new Promise<void>((resolve, reject) => {
    const worker = registration.installing || registration.waiting;
    if (!worker) { reject(new Error('Push worker unavailable')); return; }
    const timer = window.setTimeout(() => { cleanup(); reject(new Error('Push worker timed out')); }, 15_000);
    const onStateChange = () => {
      if (worker.state === 'activated') { cleanup(); resolve(); }
      else if (worker.state === 'redundant') { cleanup(); reject(new Error('Push worker failed')); }
    };
    const cleanup = () => { window.clearTimeout(timer); worker.removeEventListener('statechange', onStateChange); };
    worker.addEventListener('statechange', onStateChange);
    onStateChange();
  });
  return registration;
}

async function register(context: PushContext): Promise<PushState> {
  if (!context.userId) throw new Error('Sign in to enable push');
  const previous = savedSubscription();
  const { sdk, instance } = await messaging(context);
  const token = await sdk.getToken(instance, { vapidKey: context.vapidKey, serviceWorkerRegistration: await activeWorker() });
  if (!token) throw new Error('Push token unavailable');
  try {
    const response = await fetch('/api/push/subscription', {
      method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, userId: context.userId }),
    });
    if (!response.ok) throw new Error('Push registration failed');
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ userId: context.userId, token }));
  } catch (error) {
    // A transient refresh failure must not revoke an established subscription.
    if (previous?.userId !== context.userId) {
      await sdk.deleteToken(instance).catch(() => undefined);
      localStorage.removeItem(STORAGE_KEY);
    }
    throw error;
  }
  return 'enabled';
}

// Permission must be requested before any await so mobile browsers retain the tap gesture.
export function enablePush(context: PushContext): Promise<PushState> {
  if (!context.config || !context.userId || !('Notification' in window) || !navigator.locks) return Promise.reject(new Error('Push unavailable'));
  const permission = Notification.requestPermission();
  return permission.then(async (result) => {
    if (result === 'denied') return 'denied';
    if (result !== 'granted') return 'available';
    return withPushLock(() => register(context));
  });
}

// Web Locks coordinate across tabs, unlike a component's in-memory busy flag.
async function withPushLock<T>(action: () => Promise<T>): Promise<T> {
  return navigator.locks ? await navigator.locks.request('efbazaar.push', action) : action();
}

export function disablePush(context: PushContext): Promise<void> {
  return withPushLock(() => disableUnlocked(context));
}

async function disableUnlocked(context: PushContext): Promise<void> {
  // Persist the explicit opt-out before any network work can fail.
  const saved = savedSubscription();
  if (saved && !saved.disabled) localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, disabled: true }));
  const results = await Promise.allSettled([
    fetch('/api/push/subscription', { method: 'DELETE', credentials: 'same-origin' }).then((response) => {
      if (!response.ok) throw new Error('Push unregistration failed');
    }),
    (async () => {
      if (context.config && 'serviceWorker' in navigator) {
        const { sdk, instance } = await messaging(context);
        await sdk.deleteToken(instance);
      }
    })(),
    (async () => {
      if (!('serviceWorker' in navigator)) return;
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();
      const notifications = await registration?.getNotifications();
      notifications?.forEach((notification) => notification.close());
    })(),
  ]);
  if (results.some((result) => result.status === 'rejected')) throw new Error('Push cleanup incomplete');
  localStorage.removeItem(STORAGE_KEY);
}

export function syncPushSubscription(context: PushContext): Promise<PushState> {
  return withPushLock(() => syncUnlocked(context));
}

async function syncUnlocked(context: PushContext): Promise<PushState> {
  const state = await getPushAvailability(context);
  const saved = savedSubscription();
  if (saved && (saved.disabled || saved.userId !== context.userId)) {
    await disableUnlocked(context);
    return state;
  }
  if (state !== 'available') return state;
  if (context.userId && saved && Notification.permission === 'granted') return register(context);
  return 'available';
}

export async function listenForPush(context: PushContext, callback: (payload: MessagePayload) => void) {
  const { sdk, instance } = await messaging(context);
  return sdk.onMessage(instance, (payload) => {
    if (payload.data?.recipientUserId === context.userId) callback(payload);
  });
}
