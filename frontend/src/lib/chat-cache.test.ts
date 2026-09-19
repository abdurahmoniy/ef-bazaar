import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  chatKeys,
  chatMessagesOptions,
  commitChatMessages,
  clearOtherAccountQueries,
  markCachedChatRead,
} from './chat-cache';
import type { ChatResponse, MessageResponse } from './marketplace-types';

const message = (content: string): MessageResponse => ({
  id: 'message', chatId: 'chat', senderId: 'seller', content, createdAt: '2026-09-19T00:00:00Z',
});
const clients: QueryClient[] = [];
const client = () => {
  const value = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(value);
  return value;
};
afterEach(() => { clients.forEach(value => value.clear()); clients.length = 0; vi.unstubAllGlobals(); });

describe('account-scoped conversation cache', () => {
  it('reuses a recently fetched conversation on revisit and shares concurrent requests', async () => {
    const queryClient = client();
    const fetch = vi.fn(async () => Response.json({ content: [message('hello')], totalPages: 1 }));
    vi.stubGlobal('fetch', fetch);
    const options = chatMessagesOptions(queryClient, 'viewer', 'chat');
    const [first, concurrent] = await Promise.all([queryClient.fetchQuery(options), queryClient.fetchQuery(options)]);
    const revisit = await queryClient.fetchQuery(options);
    expect(first).toEqual([message('hello')]);
    expect(concurrent).toEqual(first);
    expect(revisit).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('separates users and removes private data on logout while preserving public data', async () => {
    const queryClient = client();
    queryClient.setQueryData(chatKeys.messages('alice', 'chat'), [message('Alice private')]);
    queryClient.setQueryData(chatKeys.messages('bob', 'chat'), [message('Bob private')]);
    queryClient.setQueryData(['public', 'catalog'], ['public']);
    clearOtherAccountQueries(queryClient, 'bob');
    expect(queryClient.getQueryData(chatKeys.messages('alice', 'chat'))).toBeUndefined();
    expect(queryClient.getQueryData(chatKeys.messages('bob', 'chat'))).toEqual([message('Bob private')]);
    clearOtherAccountQueries(queryClient, null);
    expect(queryClient.getQueryData(chatKeys.messages('bob', 'chat'))).toBeUndefined();
    expect(queryClient.getQueryData(['public', 'catalog'])).toEqual(['public']);
  });

  it('cancels an old poll before publishing an edit and invalidates related inbox counters', async () => {
    const queryClient = client();
    queryClient.setQueryData(chatKeys.messages('viewer', 'chat'), [message('before')]);
    queryClient.setQueryData(chatKeys.inbox('viewer'), []);
    queryClient.setQueryData(chatKeys.unread('viewer'), 0);
    let resolve!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { resolve = done; })));
    const poll = queryClient.fetchQuery({ ...chatMessagesOptions(queryClient, 'viewer', 'chat'), staleTime: 0 }).catch(() => undefined);
    await commitChatMessages(queryClient, 'viewer', 'chat', () => [message('edited')]);
    resolve(Response.json({ content: [message('before')], totalPages: 1 }));
    await poll;
    expect(queryClient.getQueryData(chatKeys.messages('viewer', 'chat'))).toEqual([message('edited')]);
    expect(queryClient.getQueryState(chatKeys.inbox('viewer'))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(chatKeys.unread('viewer'))?.isInvalidated).toBe(true);
  });

  it('clears a read conversation badge immediately and retains other unread messages', async () => {
    const queryClient = client();
    queryClient.setQueryData(chatKeys.inbox('viewer'), [{ id: 'chat', unreadCount: 3 }, { id: 'other', unreadCount: 2 }] as ChatResponse[]);
    queryClient.setQueryData(chatKeys.unread('viewer'), 5);
    await markCachedChatRead(queryClient, 'viewer', 'chat');
    expect(queryClient.getQueryData<ChatResponse[]>(chatKeys.inbox('viewer'))?.[0].unreadCount).toBe(0);
    expect(queryClient.getQueryData(chatKeys.unread('viewer'))).toBe(2);
  });
});
