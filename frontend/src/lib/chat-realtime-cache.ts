'use client';
import type { QueryClient } from '@tanstack/react-query';
import { getChatSocket } from './chat-socket';

/** Coalesce bursts (message + read + proposal changes) into one snapshot refresh. */
export function connectChatCache(client: QueryClient, accountId: string) {
  const changed = new Set<string>();
  let recoverAll = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = getChatSocket(accountId).subscribe(event => {
    if (event.type === 'disconnected') return;
    if (event.type === 'connected') recoverAll = true;
    else changed.add(event.chatId);
    timer ??= setTimeout(() => {
      const all = recoverAll;
      const chatIds = new Set(changed);
      timer = undefined; recoverAll = false; changed.clear();
      void client.invalidateQueries({ predicate: query => query.queryKey[0] === 'private'
        && query.queryKey[1] === accountId && query.queryKey[2] === 'chats'
        && (all || query.queryKey.length === 4 || chatIds.has(String(query.queryKey[3]))) });
    }, 50);
  });
  return () => { clearTimeout(timer); unsubscribe(); };
}
