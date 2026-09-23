import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

const features = vi.hoisted(() => ({ tournaments: false, blacklist: true }));
vi.mock('@/lib/feature-flags', () => ({ FEATURES: features }));
vi.mock('@/components/notifications/notification-bell', () => ({ NotificationBell: () => null }));
vi.mock('@/components/navigation/user-menu', () => ({ UserMenu: () => null }));
vi.mock('@/components/support/support-widget', () => ({ SupportWidget: () => null }));
vi.mock('@/components/providers/client-query-provider', () => ({ SessionCacheBoundary: () => null }));

import { MarketplaceShell } from './marketplace-shell';
import { SlidingNav } from '@/components/navigation/sliding-nav';
import type { User } from '@/lib/types';

function findDesktopNav(node: ReactNode): ReactElement<React.ComponentProps<typeof SlidingNav>> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode }>(child)) continue;
    if (child.type === SlidingNav) return child as ReactElement<React.ComponentProps<typeof SlidingNav>>;
    const found = findDesktopNav(child.props.children);
    if (found) return found;
  }
}

const user: User = {
  id: 'viewer', displayName: 'Viewer', telegramLinked: true, googleLinked: true,
  verified: true, roles: [], createdAt: '2026-08-20T10:00:00Z',
};
beforeEach(() => { features.tournaments = false; });

it('places Accounts beside Marketplace and highlights the selected destination', () => {
  const shell = MarketplaceShell({ user, activeTab: 'accounts', children: null });
  const nav = findDesktopNav(shell)!;
  expect(nav.props.items.slice(0, 2)).toEqual([
    { id: 'home', href: '/marketplace', label: 'Bozor' },
    { id: 'accounts', href: '/profile?tab=accounts', label: 'Akkountlarim' },
  ]);
  expect(nav.props.activeId).toBe('accounts');
});

it('preserves the Accounts return path for signed-out visitors', () => {
  const nav = findDesktopNav(MarketplaceShell({ user: null, children: null }))!;
  const href = nav.props.items.find((item) => item.id === 'accounts')?.href;
  expect(href).toBeDefined();
  const url = new URL(href!, 'https://efbazaar.uz');
  expect(url.pathname).toBe('/auth/login');
  expect(url.searchParams.get('from')).toBe('/profile?tab=accounts');
});

it('keeps the direct Accounts destination while session state is pending', () => {
  const nav = findDesktopNav(MarketplaceShell({ user: null, sessionPending: true, children: null }))!;
  expect(nav.props.items.find((item) => item.id === 'accounts')?.href).toBe('/profile?tab=accounts');
});

it('keeps tournaments available in desktop navigation when enabled', () => {
  features.tournaments = true;
  const nav = findDesktopNav(MarketplaceShell({ user, children: null }))!;
  expect(nav.props.items).toContainEqual({ id: 'tournaments', href: '/tournaments', label: 'Turnirlar' });
});
