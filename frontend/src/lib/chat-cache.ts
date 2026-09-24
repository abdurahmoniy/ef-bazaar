'use client';

import { queryOptions, type QueryClient } from '@tanstack/react-query';

import { ChatSocketError, getChatSocket } from './chat-socket';
import type { ChatResponse, MessageResponse, PageResponse } from './marketplace-types';

export const CHAT_STALE_TIME_MS = 5_000;
export const PRIVATE_CACHE_GC_TIME_MS = 10 * 60_000;
export const chatKeys = {
  inbox: (viewerId: string) => ['private', viewerId, 'chats', 'inbox'] as const,
  unread: (viewerId: string) => ['private', viewerId, 'chats', 'unread'] as const,
  details: (viewerId: string, chatId: string) => ['private', viewerId, 'chats', chatId, 'details'] as const,
  messages: (viewerId: string, chatId: string) => ['private', viewerId, 'chats', chatId, 'messages'] as const,
};

export { ChatSocketError as ChatRequestError };

export function mergeMessages(previous: MessageResponse[], next: MessageResponse[]) {
  const messages = new Map(previous.map(message => [message.id, message]));
  next.forEach(message => messages.set(message.id, message));
  return [...messages.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function chatDetailsOptions(viewerId: string, chatId: string) {
  return queryOptions({
    queryKey: chatKeys.details(viewerId, chatId),
    staleTime: CHAT_STALE_TIME_MS,
    gcTime: typeof window === 'undefined' ? Infinity : PRIVATE_CACHE_GC_TIME_MS,
    queryFn: ({ signal }) => getChatSocket(viewerId).request<ChatResponse>('get', chatId, undefined, signal),
  });
}

export function chatMessagesOptions(client: QueryClient, viewerId: string, chatId: string) {
  const queryKey = chatKeys.messages(viewerId, chatId);
  return queryOptions({
    queryKey,
    staleTime: CHAT_STALE_TIME_MS,
    gcTime: typeof window === 'undefined' ? Infinity : PRIVATE_CACHE_GC_TIME_MS,
    queryFn: async ({ signal }) => {
      const socket = getChatSocket(viewerId);
      const first = await socket.request<PageResponse<MessageResponse>>('messages', chatId, { page: 0, size: 200 }, signal);
      let messages = first.content;
      for (let page = 1; page < first.totalPages; page++) {
        const next = await socket.request<PageResponse<MessageResponse>>('messages', chatId, { page, size: 200 }, signal);
        messages = mergeMessages(messages, next.content);
      }
      return messages;
    },
  });
}

export function chatInboxOptions(viewerId: string) {
  return queryOptions({
    queryKey: chatKeys.inbox(viewerId),
    staleTime: CHAT_STALE_TIME_MS,
    gcTime: typeof window === 'undefined' ? Infinity : PRIVATE_CACHE_GC_TIME_MS,
    queryFn: ({ signal }) => getChatSocket(viewerId).request<ChatResponse[]>('inbox', undefined, undefined, signal),
  });
}

export function chatUnreadOptions(viewerId: string) {
  return queryOptions({
    queryKey: chatKeys.unread(viewerId),
    staleTime: 30_000,
    gcTime: typeof window === 'undefined' ? Infinity : PRIVATE_CACHE_GC_TIME_MS,
    queryFn: async ({ signal }) => {
      const payload = await getChatSocket(viewerId).request<{ count: number }>('unread', undefined, undefined, signal);
      return payload.count;
    },
  });
}

export function invalidateChatInbox(client: QueryClient, viewerId: string) {
  return Promise.all([
    client.invalidateQueries({ queryKey: chatKeys.inbox(viewerId) }),
    client.invalidateQueries({ queryKey: chatKeys.unread(viewerId) }),
  ]);
}

export async function commitChatMessages(
  client: QueryClient,
  viewerId: string,
  chatId: string,
  update: (previous: MessageResponse[]) => MessageResponse[],
) {
  const queryKey = chatKeys.messages(viewerId, chatId);
  // A snapshot started before the mutation must not replace its confirmed result.
  await client.cancelQueries({ queryKey });
  client.setQueryData<MessageResponse[]>(queryKey, previous => update(previous ?? []));
  // The cancelled snapshot may also contain another participant's concurrent
  // message. Reconcile after this acknowledgement so its push is never lost.
  void client.invalidateQueries({ queryKey });
  void invalidateChatInbox(client, viewerId);
}

export async function markCachedChatRead(client: QueryClient, viewerId: string, chatId: string) {
  await Promise.all([
    client.cancelQueries({ queryKey: chatKeys.inbox(viewerId) }),
    client.cancelQueries({ queryKey: chatKeys.unread(viewerId) }),
  ]);
  const unread = client.getQueryData<ChatResponse[]>(chatKeys.inbox(viewerId))?.find(chat => chat.id === chatId)?.unreadCount ?? 0;
  client.setQueryData<ChatResponse[]>(chatKeys.inbox(viewerId), previous => previous?.map(chat =>
    chat.id === chatId ? { ...chat, unreadCount: 0 } : chat,
  ));
  client.setQueryData<number>(chatKeys.unread(viewerId), previous => previous === undefined ? undefined : Math.max(0, previous - unread));
  void invalidateChatInbox(client, viewerId);
}

export function clearOtherAccountQueries(client: QueryClient, accountId: string | null) {
  client.removeQueries({ predicate: query => query.queryKey[0] === 'private' && query.queryKey[1] !== accountId });
}
