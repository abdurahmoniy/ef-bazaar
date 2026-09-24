'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';

export interface ChatActivity {
  online: boolean;
  typing: boolean;
  lastSeenAt: string | null;
  lastReadAt: string | null;
}
const visible = () => document.visibilityState === 'visible' && navigator.onLine;

export function usePresenceHeartbeat(accountId: string | null) {
  useEffect(() => {
    if (!accountId) return;
    const beat = () => {
      if (!visible()) return;
      void fetch(buildMarketplaceApiPath(['v1', 'chats', 'presence']), {
        method: 'POST', credentials: 'include',
      }).catch(() => {});
    };
    beat();
    const timer = window.setInterval(beat, 15000);
    document.addEventListener('visibilitychange', beat);
    window.addEventListener('online', beat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', beat);
      window.removeEventListener('online', beat);
    };
  }, [accountId]);
}

export function useChatActivity(chatId: string) {
  const [snapshot, setSnapshot] = useState<{ chatId: string; activity: ChatActivity | null; lastReadAt: string | null } | null>(null);
  const typing = useRef(false);
  const lastTypingSent = useRef(-Infinity);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const writes = useRef(Promise.resolve());
  const setTyping = useCallback((value: boolean) => {
    clearTimeout(idleTimer.current);
    const next = value && visible();
    if (next) idleTimer.current = setTimeout(() => setTyping(false), 4000);
    if (next === typing.current && (!next || Date.now() - lastTypingSent.current < 2000)) return;
    typing.current = next;
    lastTypingSent.current = Date.now();
    // Preserve start/stop ordering even on a slow connection. Draft contents
    // never leave the composer through this endpoint.
    writes.current = writes.current.then(async () => {
      if (next && !typing.current) return;
      try {
        await fetch(buildMarketplaceApiPath(['v1', 'chats', chatId, 'typing']), {
          method: 'POST', credentials: 'include', keepalive: !next,
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ typing: next }),
        });
      } catch { /* Redis TTL also clears abandoned typing indicators. */ }
    });
  }, [chatId]);

  useEffect(() => {
    let alive = true;
    let loading = false;
    let controller: AbortController | undefined;
    const unknown = () => setSnapshot(previous => ({ chatId, activity: null,
      lastReadAt: previous?.chatId === chatId ? previous.lastReadAt : null }));
    const poll = async () => {
      if (!visible()) {
        controller?.abort(); unknown(); setTyping(false); return;
      }
      if (loading) return;
      loading = true;
      const request = new AbortController();
      controller = request;
      // Never leave stale online/typing text on screen if a request hangs.
      const timeout = window.setTimeout(() => { request.abort(); if (alive) unknown(); }, 5000);
      try {
        const response = await fetch(buildMarketplaceApiPath(['v1', 'chats', chatId, 'activity']), {
          credentials: 'include', cache: 'no-store', signal: request.signal,
        });
        if (!response.ok) throw new Error('Activity unavailable');
        const activity = await response.json() as ChatActivity;
        if (typeof activity?.online !== 'boolean' || typeof activity?.typing !== 'boolean') throw new Error('Invalid activity');
        if (alive && !request.signal.aborted && visible()) setSnapshot(previous => {
          const known = previous?.chatId === chatId ? previous.lastReadAt : null;
          const lastReadAt = activity.lastReadAt && (!known || Date.parse(activity.lastReadAt) > Date.parse(known)) ? activity.lastReadAt : known;
          return { chatId, activity, lastReadAt };
        });
      } catch {
        if (alive && !request.signal.aborted) unknown();
      } finally {
        window.clearTimeout(timeout); loading = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    const update = () => { void poll(); };
    document.addEventListener('visibilitychange', update);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      alive = false; controller?.abort(); window.clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      setTyping(false); clearTimeout(idleTimer.current);
    };
  }, [chatId, setTyping]);

  return { activity: snapshot?.chatId === chatId ? snapshot.activity : null,
    lastReadAt: snapshot?.chatId === chatId ? snapshot.lastReadAt : null, setTyping };
}
