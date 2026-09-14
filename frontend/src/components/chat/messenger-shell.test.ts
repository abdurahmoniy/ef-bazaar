// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/chats/chat-1' }));
vi.mock('./chats-list-pane', () => ({
  ChatsListPane: () => createElement('div', null, 'Chat list'),
}));

import { MessengerShell } from './messenger-shell';

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
  const props = {
    chats: [],
    viewerId: 'viewer',
    children: createElement('textarea', { 'aria-label': 'Message' }),
  };

  try {
    await act(async () => root.render(createElement(MessengerShell, props)));
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
    container.remove();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: originalViewport });
    delete reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
  }
});
