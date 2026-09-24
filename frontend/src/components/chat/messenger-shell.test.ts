import { socketFixture } from '@/test/chat-socket-fixture';
// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({ pathname: '/chats/chat-1' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
vi.mock('./chats-list-pane', () => ({
  ChatsListPane: () => createElement('div', null, 'Chat list'),
}));
vi.mock('@/components/navigation/mobile-bottom-nav', () => ({
  MobileBottomNav: () => createElement('nav', { 'aria-label': 'Pastki navigatsiya' }),
}));

import { MessengerShell } from './messenger-shell';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const user = {
  id: 'viewer', displayName: 'Viewer', telegramLinked: true, googleLinked: true,
  verified: true, roles: [], createdAt: '2026-08-20T10:00:00Z',
};

it('shows bottom tabs on the inbox and marks only the active mobile pane for page transitions', async () => {
  const reactActGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props = { chats: [], initialFetchedAt: Date.now(), user, children: null };
  try {
    route.pathname = '/chats';
    await act(async () => root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(MessengerShell, props))));
    expect(container.querySelector('nav[aria-label="Pastki navigatsiya"]')).not.toBeNull();
    expect(container.querySelector('aside [data-page-transition]')).not.toBeNull();
    expect(container.querySelector('[data-page-transition] nav')).toBeNull();
    expect(container.querySelector('main[data-page-transition]')).toBeNull();

    route.pathname = '/chats/chat-1';
    await act(async () => root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(MessengerShell, props))));
    expect(container.querySelector('nav[aria-label="Pastki navigatsiya"]')).toBeNull();
    expect(container.querySelector('aside [data-page-transition]')).toBeNull();
    expect(container.querySelector('main[data-page-transition]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    queryClient.clear();
    route.pathname = '/chats/chat-1';
    delete reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
  }
});

it('keeps the conversation inside the mobile visible viewport, capped by Telegram height', async () => {
  const originalWidth = window.innerWidth;
  const originalViewport = window.visualViewport;
  const reactActGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0, scale: 1 });
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props = {
    chats: [],
    initialFetchedAt: Date.now(),
    user,
    children: createElement('textarea', { 'aria-label': 'Message' }),
  };

  try {
    await act(async () => root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(MessengerShell, props))));
    const shell = container.firstElementChild as HTMLDivElement;
    expect(shell.querySelector('textarea')).not.toBeNull();
    expect(shell.style.height).toBe('min(800px, var(--tg-viewport-height, 100dvh))');

    await act(async () => {
      viewport.height = 430;
      viewport.offsetTop = 35;
      viewport.dispatchEvent(new Event('resize'));
    });
    expect(shell.style.top).toBe('35px');
    expect(shell.style.height).toBe('min(430px, var(--tg-viewport-height, 100dvh))');

    await act(async () => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
      window.dispatchEvent(new Event('resize'));
    });
    expect(shell.style.top).toBe('');
    expect(shell.style.height).toBe('');
  } finally {
    await act(async () => root.unmount());
    queryClient.clear();
    container.remove();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: originalViewport });
    delete reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
  }
});

vi.mock('@/lib/chat-socket', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/chat-socket')>(),
  getChatSocket: () => socketFixture,
  closeOtherChatSockets: () => {},
}));
