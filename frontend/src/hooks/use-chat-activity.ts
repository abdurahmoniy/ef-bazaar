'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getChatSocket } from '@/lib/chat-socket';

export interface ChatActivity {
  online: boolean;
  typing: boolean;
  lastSeenAt: string | null;
  lastReadAt: string | null;
}
const visible = () => document.visibilityState === 'visible' && navigator.onLine;

export function useChatActivity(chatId: string, viewerId: string) {
  const [snapshot, setSnapshot] = useState<{ key: string; activity: ChatActivity | null; lastReadAt: string | null } | null>(null);
  const key = `${viewerId}:${chatId}`;
  const typing = useRef(false);
  const lastTypingSent = useRef(-Infinity);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const setTyping = useCallback((value: boolean) => {
    clearTimeout(idleTimer.current);
    const next = value && visible();
    if (next) idleTimer.current = setTimeout(() => setTyping(false), 4000);
    if (next === typing.current && (!next || Date.now() - lastTypingSent.current < 2000)) return;
    typing.current = next;
    lastTypingSent.current = Date.now();
    // The socket preserves ordering. Only a boolean leaves the composer.
    void getChatSocket(viewerId).request('typing', chatId, { typing: next }).catch(() => {});
  }, [chatId, viewerId]);

  useEffect(() => {
    const socket = getChatSocket(viewerId);
    const unwatch = socket.watch(chatId, activity => {
      setSnapshot(previous => {
        const known = previous?.key === key ? previous.lastReadAt : null;
        const lastReadAt = activity?.lastReadAt && (!known || Date.parse(activity.lastReadAt) > Date.parse(known)) ? activity.lastReadAt : known;
        return { key, activity, lastReadAt };
      });
    });
    const visibility = () => { if (!visible()) setTyping(false); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('offline', visibility);
    return () => {
      clearTimeout(idleTimer.current);
      if (typing.current) void socket.request('typing', chatId, { typing: false }).catch(() => {});
      typing.current = false; unwatch();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('offline', visibility);
    };
  }, [chatId, key, setTyping, viewerId]);

  return { activity: snapshot?.key === key ? snapshot.activity : null,
    lastReadAt: snapshot?.key === key ? snapshot.lastReadAt : null, setTyping };
}
