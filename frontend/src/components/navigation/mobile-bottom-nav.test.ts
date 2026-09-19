// @vitest-environment jsdom

import { act, createElement, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const status = vi.hoisted(() => ({ pending: false }));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: ComponentProps<'a'>) => createElement('a', props, children),
  useLinkStatus: () => status,
}));
vi.mock('@/components/chat/chats-unread-badge', () => ({ ChatsUnreadBadge: () => null }));
vi.mock('@/components/marketplace/measured-bottom-bar', () => ({
  MeasuredBottomBar: ({ as: _as, ...props }: ComponentProps<'nav'> & { as?: string }) => createElement('nav', props),
}));

import { MobileBottomNav, type MarketplaceTab } from './mobile-bottom-nav';

const user = {
  id: 'viewer', displayName: 'Viewer', telegramLinked: true, googleLinked: true,
  verified: true, roles: [], createdAt: '2026-08-20T10:00:00Z',
};
const animate = vi.fn(() => ({ cancel: vi.fn() }));
const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  animate.mockClear();
  status.pending = false;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalAnimate) Object.defineProperty(Element.prototype, 'animate', originalAnimate);
  else Reflect.deleteProperty(Element.prototype, 'animate');
});

it('preserves enabled routes, signed-out destinations, and the current-page label', () => {
  const signedIn = renderToStaticMarkup(createElement(MobileBottomNav, { user, activeTab: 'chats' }));
  expect(signedIn.match(/<a /g)).toHaveLength(5);
  expect(signedIn).toContain('href="/marketplace"');
  expect(signedIn).toContain('href="/chats" aria-current="page"');
  expect(signedIn).toContain('href="/marketplace/new"');
  expect(signedIn).toContain('href="/hamyon"');
  expect(signedIn).toContain('href="/profile"');
  expect(signedIn).not.toContain('/tournaments');

  const signedOut = renderToStaticMarkup(createElement(MobileBottomNav, { user: null }));
  expect(signedOut).toContain('/auth/login?from=/chats');
  expect(signedOut).toContain('/auth/login?from=/hamyon');
  expect(signedOut).toContain('Kirish');
  expect(signedOut).not.toContain('aria-current');
});

async function renderAcrossShells(reducedMotion: boolean) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: reducedMotion })));
  const container = document.createElement('div');
  let root = createRoot(container);
  const renderTab = async (activeTab: MarketplaceTab) => {
    await act(async () => root.render(createElement(MobileBottomNav, { user, activeTab })));
  };
  try {
    await renderTab('home');
    await act(async () => root.unmount());
    animate.mockClear();
    root = createRoot(container);
    await renderTab('chats');
    expect(container.querySelector('[aria-current="page"]')?.getAttribute('href')).toBe('/chats');
    expect((container.querySelector('[data-bottom-nav-marker]') as HTMLElement).style.transform).toBe('translateX(100%)');
  } finally {
    await act(async () => root.unmount());
  }
}

it('slides the active pill from the previous tab after the page shell remounts', async () => {
  await renderAcrossShells(false);
  expect(animate).toHaveBeenCalledWith(
    [{ transform: 'translateX(0%)' }, { transform: 'translateX(100%)' }],
    { duration: 320, easing: 'cubic-bezier(.22,1,.36,1)' },
  );
});

it('places the active pill immediately when reduced motion is enabled', async () => {
  await renderAcrossShells(true);
  expect(animate).not.toHaveBeenCalled();
});

it('shows an accessible loading status while a link is pending', () => {
  status.pending = true;
  const html = renderToStaticMarkup(createElement(MobileBottomNav, { user, activeTab: 'home' }));
  expect(html).toContain('role="status"');
  expect(html).toContain('Yuklanmoqda');
  expect(html).toContain('motion-reduce:animate-none');
});
