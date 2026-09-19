import { getTelegramWebApp } from './telegram';
import type { TelegramWebApp } from './types';
import type { PushState } from './firebase-push';

// Remember callbacks only for this SDK instance/launch, never across launches.
const grantedApps = new WeakSet<TelegramWebApp>();

export function getTelegramPushApp() {
  const app = getTelegramWebApp();
  return app?.initData ? app : null;
}

export function getTelegramPushState(app: TelegramWebApp): PushState {
  // This flag controls UI only; the provider verifies the server session first.
  if (app.initDataUnsafe?.user?.allows_write_to_pm || grantedApps.has(app)) return 'enabled';
  return app.requestWriteAccess && app.isVersionAtLeast?.('6.9') ? 'available' : 'unsupported';
}

export function enableTelegramPush(app: TelegramWebApp): Promise<PushState> {
  const state = getTelegramPushState(app);
  if (state !== 'available') return Promise.resolve(state);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Telegram permission timed out')), 30_000);
    try {
      app.requestWriteAccess!(allowed => {
        clearTimeout(timeout);
        if (allowed) grantedApps.add(app);
        resolve(allowed ? 'enabled' : 'available');
      });
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

export const telegramPushDescriptions = {
  loading: 'Telegram ruxsati tekshirilmoqda…',
  available: 'Savdo va boshqa yangiliklarni EfBazaar botidan Telegram xabari sifatida oling.',
  unsupported: 'Telegram ilovasini yangilang va mini ilovani qayta oching.',
  unconfigured: 'Bildirishnomalarni yoqish uchun Telegram orqali hisobingizga kiring.',
  error: 'Telegram ruxsatini tekshirib bo‘lmadi. Qayta urinib ko‘ring.',
};
