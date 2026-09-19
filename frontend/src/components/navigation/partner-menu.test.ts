// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/app/auth/actions', () => ({ logoutAction: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, push() {} }), usePathname: () => '/profile', useSearchParams: () => new URLSearchParams() }));
vi.mock('@/components/theme/use-theme', () => ({ useTheme: () => ({ isDark: false, mounted: true, toggle() {} }) }));
vi.mock('@/lib/partners', () => ({ getMyApplication: vi.fn() }));
vi.mock('@/lib/notifications-client', () => ({ fetchUnreadCount: vi.fn().mockResolvedValue(0) }));
vi.mock('@/components/profile/google-link-button', () => ({ GoogleLinkButton: () => null }));
vi.mock('@/components/profile/link-telegram-button', () => ({ LinkTelegramButton: () => null }));
vi.mock('@/components/profile/delete-account-button', () => ({ DeleteAccountButton: () => null }));
vi.mock('@/components/profile/trade-admin-application-panel', () => ({ TradeAdminApplicationPanel: () => null }));
import { UserMenu } from './user-menu';
import { ProfileAccount } from '@/components/profile/profile-account';
import { getMyApplication, type PartnerApplication } from '@/lib/partners';
import type { User } from '@/lib/types';

const user: User = { id: 'a', displayName: 'Partner', roles: ['ROLE_ADMIN'], telegramLinked: true, googleLinked: true, verified: true, createdAt: '2026-01-01T00:00:00Z' };
let container: HTMLDivElement; let root: Root;
beforeEach(() => {
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
 vi.mocked(getMyApplication).mockResolvedValue({ status: 'APPROVED' } as PartnerApplication);
 container=document.createElement('div'); document.body.appendChild(container); root=createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
async function openMenu(person = user) {
 await act(async () => root.render(createElement(UserMenu, { user: person })));
 await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Profil menyusi"]')!.click());
}

describe('approved partner navigation', () => {
 it('shows Hamkor paneli for an approved admin without a partner role', async () => {
  await openMenu();
  expect(container.querySelector('a[href="/partner"]')?.textContent).toContain('Hamkor paneli');
  expect(container.querySelector('a[href="/partnership"]')).toBeNull();
  expect(container.querySelector('a[href="/admin"]')).not.toBeNull();
 });
 it('shows the panel for an approved user whose role has not updated', async () => {
  await openMenu({ ...user, roles: ['ROLE_USER'] });
  expect(container.querySelector('a[href="/partner"]')).not.toBeNull();
 });
 it.each(['AWAITING_REVIEW', 'CANCELLED', 'REJECTED'] as const)('does not show the panel for %s despite a stale partner role', async status => {
  vi.mocked(getMyApplication).mockResolvedValue({ status } as PartnerApplication);
  await openMenu({ ...user, roles: ['ROLE_PARTNER'] });
  expect(container.querySelector('a[href="/partner"]')).toBeNull();
  expect(container.querySelector('a[href="/partnership"]')).not.toBeNull();
 });
 it('keeps the application link for users without a partnership', async () => {
  vi.mocked(getMyApplication).mockResolvedValue(null);
  await openMenu({ ...user, roles: ['ROLE_USER'] });
  expect(container.querySelector('a[href="/partnership"]')).not.toBeNull();
 });
 it('keeps the menu usable during a status lookup failure', async () => {
  vi.mocked(getMyApplication).mockRejectedValue(new Error('offline'));
  await openMenu();
  expect(container.querySelector('a[href="/profile"]')).not.toBeNull();
 });
 it('adds Hamkor paneli to the profile menu for approved partners', async () => {
  await act(async () => root.render(createElement(ProfileAccount, { user, googleClientId: '', botUsername: 'test', tradeAdminApplication: null })));
  expect(container.querySelector('a[href="/partner"]')?.textContent).toContain('Hamkor paneli');
  expect(container.querySelector('a[href="/partnership"]')).toBeNull();
 });
});
