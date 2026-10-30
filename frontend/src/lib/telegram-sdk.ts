import { getTelegramWebApp } from './telegram';

export const TELEGRAM_SDK_EVENT = 'efbazaar:telegram-sdk';
export const TELEGRAM_SDK_SRC = 'https://telegram.org/js/telegram-web-app.js?63';
type SdkStatus = 'idle' | 'loading' | 'ready' | 'failed';
let status: SdkStatus = 'idle';
let pending: Promise<void> | null = null;

export function getTelegramSdkStatus(): SdkStatus {
  return getTelegramWebApp() ? 'ready' : status;
}

export function subscribeTelegramSdk(listener: () => void) {
  window.addEventListener(TELEGRAM_SDK_EVENT, listener);
  return () => window.removeEventListener(TELEGRAM_SDK_EVENT, listener);
}

function publish(next: SdkStatus) {
  status = next;
  window.dispatchEvent(new Event(TELEGRAM_SDK_EVENT));
}

/** Native SDK loading never participates in Next's hydration startup queue. */
export function loadTelegramSdk(): Promise<void> {
  if (getTelegramWebApp()) return Promise.resolve();
  if (pending) return pending;
  publish('loading');
  pending = new Promise<void>(resolve => {
    const script = document.querySelector<HTMLScriptElement>(`script[src="${TELEGRAM_SDK_SRC}"]`)
      ?? document.createElement('script');
    const timer = window.setTimeout(() => finish(), 15_000);
    function finish() {
      window.clearTimeout(timer);
      script.removeEventListener('load', finish);
      script.removeEventListener('error', finish);
      const ready = Boolean(getTelegramWebApp());
      if (!ready) script.remove();
      publish(ready ? 'ready' : 'failed');
      resolve();
    }
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', finish, { once: true });
    if (!script.isConnected) {
      script.src = TELEGRAM_SDK_SRC;
      script.async = true;
      document.head.append(script);
    }
  }).finally(() => { pending = null; });
  return pending;
}
