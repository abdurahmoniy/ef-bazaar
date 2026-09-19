'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { dismissPushInvitation, PushPermissionPrompt } from './push-permission-prompt';
import {
  disablePush, enablePush, listenForPush, NOTIFICATIONS_CHANGED, syncPushSubscription,
  type PushContext, type PushState,
} from '@/lib/firebase-push';

interface PushControls {
  state: PushState;
  busy: boolean;
  enable: () => void;
  disable: () => void;
  retry: () => void;
}
const PushControlsContext = createContext<PushControls>({ state: 'loading', busy: false, enable: () => {}, disable: () => {}, retry: () => {} });
export const usePushNotifications = () => useContext(PushControlsContext);

export function PushProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<PushState>('loading');
  const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const context = useRef<PushContext | null>(null);
  const pending = useRef(false);
  const unsubscribe = useRef<(() => void) | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    try {
      const response = await fetch('/api/push/config', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('Push unavailable');
      const next = await response.json() as PushContext;
      context.current = next;
      unsubscribe.current?.();
      unsubscribe.current = null;
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

  function enable() {
    if (!context.current || pending.current) return;
    pending.current = true;
    setBusy(true);
    // Call directly from the click to retain the browser's permission gesture.
    void enablePush(context.current).then(async (status) => {
      setState(status);
      if (status === 'enabled' && context.current) {
        unsubscribe.current?.();
        unsubscribe.current = await listenForPush(context.current, () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED)));
      }
    }).catch(() => setState('error')).finally(() => {
      pending.current = false; setBusy(false);
    });
  }
  function disable() {
    if (!context.current || pending.current) return;
    if (context.current.userId) dismissPushInvitation(context.current.userId);
    pending.current = true;
    setBusy(true);
    void disablePush(context.current).then(() => {
      unsubscribe.current?.(); unsubscribe.current = null; setState('available');
    }).catch(() => setState('error')).finally(() => { pending.current = false; setBusy(false); });
  }
  return <PushControlsContext.Provider value={{ state, busy, enable, disable, retry: () => { void refresh(); } }}>
    {children}
    <PushPermissionPrompt userId={userId} state={state} busy={busy} enable={enable} />
  </PushControlsContext.Provider>;
}
