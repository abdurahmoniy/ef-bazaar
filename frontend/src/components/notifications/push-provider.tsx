'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { enableTelegramPush, getTelegramPushApp, getTelegramPushState } from '@/lib/telegram-push';
import type { TelegramWebApp } from '@/lib/types';
import { dismissPushInvitation, isPushInvitationDismissed, PushPermissionPrompt } from './push-permission-prompt';
import {
  disablePush, enablePush, listenForPush, NOTIFICATIONS_CHANGED, syncPushSubscription,
  type PushContext, type PushState,
} from '@/lib/firebase-push';

interface PushControls {
  transport: 'browser' | 'telegram';
  state: PushState;
  busy: boolean;
  enable: () => void;
  disable: () => void;
  retry: () => void;
}
const PushControlsContext = createContext<PushControls>({ transport: 'browser', state: 'loading', busy: false, enable: () => {}, disable: () => {}, retry: () => {} });
export const usePushNotifications = () => useContext(PushControlsContext);

export function PushProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<PushState>('loading');
  const [transport, setTransport] = useState<'browser' | 'telegram'>('browser');
  const telegram = useRef<TelegramWebApp | null>(null);
  const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const context = useRef<PushContext | null>(null);
  const pending = useRef(false);
  const unsubscribe = useRef<(() => void) | null>(null);
  const mounted = useRef(true);
  const automaticAttempts = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    try {
      const app = getTelegramPushApp();
      telegram.current = null;
      context.current = null;
      unsubscribe.current?.();
      unsubscribe.current = null;
      if (mounted.current) setTransport(app ? 'telegram' : 'browser');
      if (app) {
        const response = await fetch('/api/telegram-webapp', { credentials: 'same-origin', cache: 'no-store' });
        if (!response.ok) throw new Error('Telegram session unavailable');
        const session = await response.json() as { telegramId: number | null };
        const id = app.initDataUnsafe?.user?.id;
        const matches = typeof id === 'number' && Number.isSafeInteger(id) && id > 0 && session.telegramId === id;
        if (matches) telegram.current = app;
        if (mounted.current) {
          setUserId(matches ? `telegram:${id}` : null);
          setState(matches ? getTelegramPushState(app) : 'unconfigured');
        }
        return;
      }
      const response = await fetch('/api/push/config', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('Push unavailable');
      const next = await response.json() as PushContext;
      context.current = next;
      const status = await syncPushSubscription(next);
      if (mounted.current) { setState(status); setUserId(next.userId); }
      if (status === 'enabled' && mounted.current) {
        const cleanup = await listenForPush(next, () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED)));
        if (mounted.current) unsubscribe.current = cleanup;
        else cleanup();
      }
    } catch { if (mounted.current) { setState('error'); setUserId(null); } }
    finally { pending.current = false; }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const changed = (event: StorageEvent) => { if (event.key === 'efbazaar.push') void refresh(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', changed);
    document.addEventListener('visibilitychange', visible);
    return () => {
      mounted.current = false;
      unsubscribe.current?.();
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', changed);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh]);

  useEffect(() => { void refresh(); }, [pathname, refresh]);

  const startEnable = useCallback((automatic: boolean) => {
    if ((!context.current && !telegram.current) || pending.current) return;
    const current = context.current;
    const app = telegram.current;
    pending.current = true;
    setBusy(true);
    // Keep native/browser permission requests inside the manual tap gesture.
    void (async () => {
      try {
        const status = await (app ? enableTelegramPush(app) : enablePush(current!));
        if (!mounted.current) return;
        setState(status);
        if (status === 'enabled' && current) {
          unsubscribe.current?.();
          const cleanup = await listenForPush(current, () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED)));
          if (mounted.current) unsubscribe.current = cleanup;
          else cleanup();
        }
      } catch {
        // Browsers may refuse page-load requests. Keep the manual button usable.
        if (mounted.current) setState(automatic ? 'available' : 'error');
      } finally {
        pending.current = false;
        if (mounted.current) setBusy(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!userId || state !== 'available' || pending.current
      || (transport === 'browser' && (!('Notification' in window) || Notification.permission !== 'default'))
      || isPushInvitationDismissed(userId)
      || automaticAttempts.current.has(userId)) return;
    const key = `efbazaar.push-auto-request:${userId}`;
    try { if (sessionStorage.getItem(key)) return; } catch { /* Use the in-memory guard. */ }
    automaticAttempts.current.add(userId);
    try { sessionStorage.setItem(key, 'attempted'); } catch { /* Storage may be unavailable. */ }
    startEnable(true);
  }, [userId, state, transport, startEnable]);

  const enable = () => startEnable(false);
  function disable() {
    if (!context.current || pending.current) return;
    if (context.current.userId) dismissPushInvitation(context.current.userId);
    pending.current = true;
    setBusy(true);
    void disablePush(context.current).then(() => {
      unsubscribe.current?.(); unsubscribe.current = null; setState('available');
    }).catch(() => setState('error')).finally(() => { pending.current = false; setBusy(false); });
  }
  return <PushControlsContext.Provider value={{ state, transport, busy, enable, disable, retry: () => { void refresh(); } }}>
    {children}
    <PushPermissionPrompt transport={transport} userId={userId} state={state} busy={busy} enable={enable} />
  </PushControlsContext.Provider>;
}
