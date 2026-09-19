'use client';

import { queryOptions, type QueryClient } from '@tanstack/react-query';

import { buildMarketplaceApiPath } from './marketplace-client-api';
import type { ChatResponse, MessageResponse, PageResponse } from './marketplace-types';

export const CHAT_STALE_TIME_MS = 5_000;
export const PRIVATE_CACHE_GC_TIME_MS = 10 * 60_000;
export const chatKeys = {
  inbox: (viewerId: string) => ['private', viewerId, 'chats', 'inbox'] as const,
  unread: (viewerId: string) => ['private', viewerId, 'chats', 'unread'] as const,
  messages: (viewerId: string, chatId: string) => ['private', viewerId, 'chats', chatId, 'messages'] as const,
};

export class ChatRequestError extends Error {
  constructor(readonly status: number) {
    super(`Chat request failed (${status})`);
  }

  get permanent() {
    return this.status >= 400 && this.status < 500 && this.status !== 408 && this.status !== 429;
  }
}

async function readChatData<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include', cache: 'no-store', signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new ChatRequestError(response.status);
  return response.json() as Promise<T>;
}

export function mergeMessages(previous: MessageResponse[], next: MessageResponse[]) {
  const messages = new Map(previous.map(message => [message.id, message]));
  next.forEach(message => messages.set(message.id, message));
  return [...messages.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function chatMessagesOptions(client: QueryClient, viewerId: string, chatId: string) {
  const queryKey = chatKeys.messages(viewerId, chatId);
  return queryOptions({
    queryKey,
    staleTime: CHAT_STALE_TIME_MS,
    gcTime: typeof window === 'undefined' ? Infinity : PRIVATE_CACHE_GC_TIME_MS,
    queryFn: async ({ signal }) => {
      const page = await readChatData<PageResponse<MessageResponse>>(
        buildMarketplaceApiPath(['v1', 'chats', chatId, 'messages']) + '?size=200&sort=createdAt,asc', signal,
      );
      return page.totalPages <= 1 ? page.content : mergeMessages(client.getQueryData(queryKey) ?? [], page.content);
    },
  });
}

export function chatInboxOptions(viewerId: string) {
  return queryOptions({
    queryKey: chatKeys.inbox(viewerId),
    staleTime: CHAT_STALE_TIME_MS,
    gcTime: typeof window === 'undefined' ? Infinity : PRIVATE_CACHE_GC_TIME_MS,
    queryFn: ({ signal }) => readChatData<ChatResponse[]>(buildMarketplaceApiPath(['v1', 'chats', 'me']), signal),
  });
}

export function chatUnreadOptions(viewerId: string) {
  return queryOptions({
    queryKey: chatKeys.unread(viewerId),
    staleTime: 30_000,
    gcTime: typeof window === 'undefined' ? Infinity : PRIVATE_CACHE_GC_TIME_MS,
    queryFn: async ({ signal }) => {
      const payload = await readChatData<{ count: number }>(buildMarketplaceApiPath(['v1', 'chats', 'unread-total']), signal);
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
  // A poll started before the mutation must not replace its confirmed result.
  await client.cancelQueries({ queryKey });
  client.setQueryData<MessageResponse[]>(queryKey, previous => update(previous ?? []));
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
