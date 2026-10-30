'use client';

import { useSyncExternalStore } from 'react';
import { getTelegramWebApp } from '@/lib/telegram';
import { getTelegramSdkStatus, subscribeTelegramSdk } from '@/lib/telegram-sdk';

export function useTelegramWebApp() {
  return useSyncExternalStore(subscribeTelegramSdk, getTelegramWebApp, () => undefined);
}

export function useTelegramSdkStatus() {
  return useSyncExternalStore(subscribeTelegramSdk, getTelegramSdkStatus, () => 'idle' as const);
}
