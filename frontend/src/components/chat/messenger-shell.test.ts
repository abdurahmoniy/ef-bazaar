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

it.each([
  { name: 'Samsung overlay', height: 800, telegramBottom: 24, contentBottom: 0, browserBottom: 0, expected: 24 },
  { name: 'native iOS already safe', height: 800, telegramBottom: 0, contentBottom: 0, browserBottom: 34, expected: 0 },
  { name: 'viewport already excludes the home indicator', height: 766, telegramBottom: 34, contentBottom: 0, browserBottom: 34, expected: 0 },
  { name: 'partly excluded navigation bar', height: 788, telegramBottom: 24, contentBottom: 0, browserBottom: 0, expected: 12 },
  { name: 'Telegram content controls', height: 800, telegramBottom: 0, contentBottom: 20, browserBottom: 34, expected: 20 },
  { name: 'ordinary Safari', height: 800, telegramBottom: undefined, contentBottom: undefined, browserBottom: 34, expected: 34 },
])('pads only the uncovered bottom inset: $name', async ({ height, telegramBottom, contentBottom, browserBottom, expected }) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerWidth', 390);
  vi.stubGlobal('innerHeight', 800);
  const viewport = Object.assign(new EventTarget(), { height, offsetTop: 0, scale: 1 });
  vi.stubGlobal('visualViewport', viewport);
  const callbacks = new Map<string, () => void>();
  const webApp = { initData: telegramBottom === undefined ? '' : 'signed', safeAreaInset: { bottom: telegramBottom }, contentSafeAreaInset: { bottom: contentBottom }, onEvent: (event: string, callback: () => void) => callbacks.set(event, callback), offEvent: vi.fn() };
  vi.stubGlobal('Telegram', { WebApp: webApp });
  const actualStyle = window.getComputedStyle;
  vi.spyOn(window, 'getComputedStyle').mockImplementation(element => element.getAttribute('data-chat-safe-area-probe') !== null ? { paddingBottom: `${browserBottom}px` } as CSSStyleDeclaration : actualStyle(element));
  const props = { chats: [], initialFetchedAt: Date.now(), user, children: createElement('textarea') };
  const previousTelegramHeight = document.documentElement.style.getPropertyValue('--tg-viewport-height');
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await act(async () => root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(MessengerShell, props))));
    const shell = container.firstElementChild as HTMLElement;
    expect(shell.style.getPropertyValue('--chat-safe-bottom')).toBe(`${expected}px`);
    // Opening/closing the keyboard must follow geometry, even if focus remains.
    await act(async () => { container.querySelector('textarea')!.focus(); viewport.height = 430; viewport.dispatchEvent(new Event('resize')); });
    expect(shell.style.getPropertyValue('--chat-safe-bottom')).toBe('0px');
    await act(async () => { viewport.height = height; viewport.dispatchEvent(new Event('resize')); });
    expect(document.activeElement).toBe(container.querySelector('textarea'));
    expect(shell.style.getPropertyValue('--chat-safe-bottom')).toBe(`${expected}px`);
    if (telegramBottom !== undefined) {
      await act(async () => { webApp.safeAreaInset.bottom = 30; callbacks.get('safeAreaChanged')?.(); });
      expect(shell.style.getPropertyValue('--chat-safe-bottom')).toBe(`${Math.max(0, 30 - (800 - height))}px`);
    } else {
      // The SDK can finish loading after the shell mounted.
      await act(async () => {
        webApp.initData = 'signed'; webApp.safeAreaInset.bottom = 0;
        document.documentElement.style.setProperty('--tg-viewport-height', '800px');
      });
      expect(shell.style.getPropertyValue('--chat-safe-bottom')).toBe('0px');
    }
    // React to host viewport changes even without a browser resize.
    await act(async () => document.documentElement.style.setProperty('--tg-viewport-height', '750px'));
    expect(shell.style.getPropertyValue('--chat-safe-bottom')).toBe('0px');
  } finally {
    await act(async () => root.unmount()); queryClient.clear(); container.remove();
    expect(document.querySelector('[data-chat-safe-area-probe]')).toBeNull();
    if (previousTelegramHeight) document.documentElement.style.setProperty('--tg-viewport-height', previousTelegramHeight);
    else document.documentElement.style.removeProperty('--tg-viewport-height');
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  }
});
