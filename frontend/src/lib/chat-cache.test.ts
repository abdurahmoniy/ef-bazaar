import { socketFixture } from '@/test/chat-socket-fixture';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
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
it('does not commit an acknowledgement after its account is cleared during cancellation', async () => {
  const queryClient = client();
  const key = chatKeys.messages('viewer', 'chat');
  queryClient.setQueryData(key, []);
  const owner = queryClient.getQueryCache().find({ queryKey: key, exact: true });
  const commit = commitChatMessages(queryClient, 'viewer', 'chat', () => [message('late')],
    () => queryClient.getQueryCache().find({ queryKey: key, exact: true }) === owner);
  clearOtherAccountQueries(queryClient, null);
  await commit;
  expect(queryClient.getQueryData(key)).toBeUndefined();
});
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

vi.mock('@/lib/chat-socket', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/chat-socket')>(),
  getChatSocket: () => socketFixture,
  closeOtherChatSockets: () => {},
}));

it('reconciles a remote message when a local acknowledgement cancels its pushed snapshot', async () => {
  const queryClient = client();
  const a = { ...message('A'), id: 'a' }, b = { ...message('B'), id: 'b' }, c = { ...message('C'), id: 'c' };
  const options = chatMessagesOptions(queryClient, 'viewer', 'chat');
  queryClient.setQueryData(options.queryKey, [a]);
  let oldSnapshot!: (response: Response) => void;
  const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { oldSnapshot = resolve; }))
    .mockResolvedValue(Response.json({ content: [a, b, c], totalPages: 1 }));
  vi.stubGlobal('fetch', fetch);
  const observer = new QueryObserver(queryClient, options); const stop = observer.subscribe(() => {});
  const remotePush = queryClient.invalidateQueries({ queryKey: options.queryKey });
  await commitChatMessages(queryClient, 'viewer', 'chat', previous => [...previous, c]);
  oldSnapshot(Response.json({ content: [a, b], totalPages: 1 }));
  await remotePush;
  await queryClient.fetchQuery(options);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(queryClient.getQueryData(options.queryKey)).toEqual([a, b, c]);
  stop();
});
it('loads every message page so arrivals beyond the first 200 are not lost', async () => {
  const queryClient = client();
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ content: [{ ...message('first'), id: 'first' }], totalPages: 2 }))
    .mockResolvedValueOnce(Response.json({ content: [{ ...message('latest'), id: 'latest' }], totalPages: 2 }));
  vi.stubGlobal('fetch', fetch);
  const result = await queryClient.fetchQuery(chatMessagesOptions(queryClient, 'viewer', 'chat'));
  expect(result.map(item => item.id)).toEqual(['first', 'latest']);
  expect(fetch).toHaveBeenCalledTimes(2);
});
