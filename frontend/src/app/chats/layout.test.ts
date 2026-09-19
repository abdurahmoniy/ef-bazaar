// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { chatKeys } from '@/lib/chat-cache';
import type { ChatResponse } from '@/lib/marketplace-types';

vi.mock('next/navigation', () => ({ usePathname: () => '/chats', redirect: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getMe: async () => ({ id: 'viewer' }) }));
vi.mock('@/lib/marketplace-server', () => ({
  getMyChats: async () => [],
  getMyChatsResult: async () => ({ ok: false, error: { status: 503, message: 'Unavailable' } }),
}));
vi.mock('@/components/chat/chats-list-pane', () => ({
  ChatsListPane: ({ chats }: { chats: ChatResponse[] }) => createElement('div', null, chats.map(chat => chat.id).join(',')),
}));
vi.mock('@/components/navigation/mobile-bottom-nav', () => ({ MobileBottomNav: () => null }));

import ChatsLayout from './layout';

const chats = [{ id: 'cached-conversation', unreadCount: 2 }] as ChatResponse[];
let client: QueryClient;
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(chats)));
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  vi.unstubAllGlobals();
});

async function renderFailedServerInbox() {
  const shell = await ChatsLayout({ children: null });
  await act(async () => root.render(createElement(QueryClientProvider, { client }, shell)));
}

it('keeps cached conversations when the server inbox request fails', async () => {
  client.setQueryData(chatKeys.inbox('viewer'), chats, { updatedAt: Date.now() - 1_000 });
  await renderFailedServerInbox();
  expect(client.getQueryData(chatKeys.inbox('viewer'))).toEqual(chats);
  expect(container.textContent).toContain('cached-conversation');
});

it('retries immediately when a failed server inbox request has no cached conversations', async () => {
  await renderFailedServerInbox();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(client.getQueryData(chatKeys.inbox('viewer'))).toEqual(chats);
});
