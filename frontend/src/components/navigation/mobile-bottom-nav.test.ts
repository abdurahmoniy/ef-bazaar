// @vitest-environment jsdom

import { act, createElement, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const status = vi.hoisted(() => ({ pending: false }));
const features = vi.hoisted(() => ({ tournaments: false, wallet: true }));
vi.mock('@/lib/feature-flags', () => ({ FEATURES: features }));
vi.mock('next/link', () => ({
  default: ({ children, prefetch: _prefetch, ...props }: ComponentProps<'a'> & { prefetch?: boolean }) => createElement('a', props, children),
  useLinkStatus: () => status,
}));
const location = vi.hoisted(() => ({ pathname: '/marketplace/listing-1', search: 'ref=share' }));
vi.mock('next/navigation', () => ({
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams(location.search),
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
  features.tournaments = false;
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
  expect(signedIn).toContain('href="/profile?tab=accounts"');
  expect(signedIn).not.toContain('/hamyon');
  const nav = document.createElement('div');
  nav.innerHTML = signedIn;
  expect([...nav.querySelectorAll('a')].map((link) => link.textContent)).toEqual(['Bozor', 'Akkountlarim', 'Sotish', 'Chatlar', 'Profil']);
  expect(signedIn).toContain('href="/profile"');
  expect(signedIn).not.toContain('/tournaments');

  const signedOut = renderToStaticMarkup(createElement(MobileBottomNav, { user: null }));
  expect(signedOut).toContain('/auth/login?from=/chats');
  const signedOutNav = document.createElement('div');
  signedOutNav.innerHTML = signedOut;
  const accounts = [...signedOutNav.querySelectorAll('a')].find((link) => link.textContent === 'Akkountlarim');
  expect(new URL(accounts!.href, 'https://efbazaar.uz').searchParams.get('from')).toBe('/profile?tab=accounts');
  const login = [...signedOutNav.querySelectorAll('a')].find((link) => link.textContent === 'Kirish');
  const loginUrl = new URL(login!.getAttribute('href')!, 'https://efbazaar.uz');
  expect(loginUrl.pathname).toBe('/auth/login');
  expect(loginUrl.searchParams.get('from')).toBe('/marketplace/listing-1?ref=share');
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
    expect((container.querySelector('[data-bottom-nav-marker]') as HTMLElement).style.transform).toBe('translateX(300%)');
  } finally {
    await act(async () => root.unmount());
  }
}

it('slides the active pill from the previous tab after the page shell remounts', async () => {
  await renderAcrossShells(false);
  expect(animate).toHaveBeenCalledWith(
    [{ transform: 'translateX(0%)' }, { transform: 'translateX(300%)' }],
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

it('keeps protected destinations while the session is still loading', () => {
  const html = renderToStaticMarkup(createElement(MobileBottomNav, { user: null, sessionPending: true }));
  expect(html).toContain('href="/chats"');
  expect(html).toContain('href="/profile?tab=accounts"');
  expect(html).toContain('href="/profile"');
  expect(html).not.toContain('/auth/login');
});

it('keeps exactly five mobile destinations when tournaments are enabled', () => {
  features.tournaments = true;
  const html = renderToStaticMarkup(createElement(MobileBottomNav, { user, activeTab: 'accounts' }));
  expect(html.match(/<a /g)).toHaveLength(5);
  expect(html).not.toContain('/tournaments');
  expect(html).toContain('href="/profile?tab=accounts" aria-current="page"');
  expect(html).toContain('width:20%;transform:translateX(100%)');
});
