import { Children, isValidElement, type ComponentType, type ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getMe: vi.fn(),
  getAccounts: vi.fn(),
  getFavorites: vi.fn(),
  getCards: vi.fn(),
  getTrades: vi.fn(),
  getRating: vi.fn(),
  getApplication: vi.fn(),
  getWallet: vi.fn(),
  getDisplay: vi.fn(),
  redirect: vi.fn((url: string) => { throw new Error(`redirect:${url}`); }),
}));
const features = vi.hoisted(() => ({ wallet: true }));
vi.mock('@/lib/feature-flags', () => ({ FEATURES: features }));
vi.mock('@/lib/auth', () => ({ getMe: mocks.getMe }));
vi.mock('@/lib/accounts-server', () => ({ getMyAccountsServer: mocks.getAccounts }));
vi.mock('@/lib/marketplace-server', () => ({ getMyFavorites: mocks.getFavorites }));
vi.mock('@/lib/trade-server', () => ({ getMyCards: mocks.getCards, getMyTrades: mocks.getTrades, getSellerRatingSummary: mocks.getRating }));
vi.mock('@/lib/trade-admin-applications-server', () => ({ getMyTradeAdminApplication: mocks.getApplication }));
vi.mock('@/lib/plans-server', () => ({ getMyPlanSSR: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/payment-server', () => ({ getWallet: mocks.getWallet }));
vi.mock('@/lib/account-display-server', () => ({ getAccountDisplayData: mocks.getDisplay }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/components/marketplace/marketplace-shell', () => ({ MarketplaceShell: () => null }));
vi.mock('@/components/profile/profile-account', () => ({ ProfileAccount: () => null }));
vi.mock('@/components/profile/profile-accounts', () => ({ ProfileAccounts: () => null }));
vi.mock('@/components/profile/profile-cards', () => ({ ProfileCards: () => null }));
vi.mock('@/components/profile/profile-listings', () => ({ ProfileListings: () => null }));
vi.mock('@/components/profile/profile-trades', () => ({ ProfileTrades: () => null }));
vi.mock('@/components/profile/mailbox-slots-warning', () => ({ MailboxSlotsWarning: () => null }));

import ProfilePage from './page';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { ProfileAccount } from '@/components/profile/profile-account';
import { ProfileAccounts } from '@/components/profile/profile-accounts';

function propsOf<P extends object>(node: ReactNode, component: ComponentType<P>): P | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode }>(child)) continue;
    if (child.type === component) return child.props as P;
    const found = propsOf(child.props.children, component);
    if (found) return found;
  }
}

const user = { id: 'viewer' };
const accounts = [{ id: 'account', title: 'Team', onMarket: true }];
const display = { account: { price: 120000, mailboxHref: '/mail/owned' } };
const open = (tab?: string) => ProfilePage({ searchParams: Promise.resolve({ tab }) });

beforeEach(() => {
  vi.clearAllMocks();
  features.wallet = true;
  mocks.getMe.mockResolvedValue(user);
  mocks.getAccounts.mockResolvedValue(accounts);
  mocks.getFavorites.mockResolvedValue([]);
  mocks.getCards.mockResolvedValue([]);
  mocks.getTrades.mockResolvedValue({ items: [] });
  mocks.getRating.mockResolvedValue(null);
  mocks.getApplication.mockResolvedValue(null);
  mocks.getWallet.mockResolvedValue({ availableTiyin: 0 });
  mocks.getDisplay.mockResolvedValue(display);
});

it.each(['accounts', 'listings'])('selects Accounts and supplies display data for the %s tab', async (tab) => {
  const page = await open(tab);
  expect(page.type).toBe(MarketplaceShell);
  expect(page.props.activeTab).toBe('accounts');
  expect(mocks.getDisplay).toHaveBeenCalledExactlyOnceWith(accounts, user.id);
  expect(propsOf(page, ProfileAccounts)).toMatchObject({ accounts, displayById: display, viewerId: user.id });
  expect(mocks.getWallet).not.toHaveBeenCalled();
  expect(mocks.getFavorites).not.toHaveBeenCalled();
});

it.each(['accounts', 'listings'])('preserves the Accounts destination through login for %s', async (tab) => {
  mocks.getMe.mockResolvedValue(null);
  await expect(open(tab)).rejects.toThrow('redirect:');
  const destination = new URL(mocks.redirect.mock.calls[0][0], 'https://efbazaar.uz');
  expect(destination.pathname).toBe('/auth/login');
  expect(destination.searchParams.get('from')).toBe('/profile?tab=accounts');
  expect(mocks.getAccounts).not.toHaveBeenCalled();
  expect(mocks.getDisplay).not.toHaveBeenCalled();
  expect(mocks.getWallet).not.toHaveBeenCalled();
});

it.each([undefined, 'account', 'trades', 'favorites', 'kartalar'])('only loads wallet data for the profile identity tab (%s)', async (tab) => {
  const page = await open(tab);
  expect(page.props.activeTab).toBe('profile');
  expect(mocks.getDisplay).not.toHaveBeenCalled();
  expect(mocks.getWallet).toHaveBeenCalledTimes(tab === undefined || tab === 'account' ? 1 : 0);
});

it('preserves a real zero balance and distinguishes unavailable wallet data', async () => {
  expect(propsOf(await open(), ProfileAccount)?.availableTiyin).toBe(0);
  mocks.getWallet.mockResolvedValue(null);
  expect(propsOf(await open(), ProfileAccount)?.availableTiyin).toBeNull();
});

it('does not fetch wallet data when the wallet feature is disabled', async () => {
  features.wallet = false;
  const page = await open();
  expect(mocks.getWallet).not.toHaveBeenCalled();
  expect(propsOf(page, ProfileAccount)?.availableTiyin).toBeNull();
});

it('counts only the accounts the owner still has, not the sold history', async () => {
  mocks.getAccounts.mockResolvedValue([...accounts, { id: 'sold', title: 'Eski', onMarket: false, status: 'ARCHIVED' }]);
  expect(propsOf(await open(), ProfileAccount)?.listingsCount).toBe(1);
});
