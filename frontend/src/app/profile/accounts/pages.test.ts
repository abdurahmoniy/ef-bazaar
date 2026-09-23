import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getMe: vi.fn(),
  getAccount: vi.fn(),
  getDefinitions: vi.fn(),
  redirect: vi.fn((url: string) => { throw new Error(`redirect:${url}`); }),
}));
vi.mock('@/lib/auth', () => ({ getMe: mocks.getMe }));
vi.mock('@/lib/accounts-server', () => ({ getAccountServer: mocks.getAccount }));
vi.mock('@/lib/marketplace-server', () => ({ getAttributeDefinitions: mocks.getDefinitions }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: vi.fn() }));
vi.mock('@/components/marketplace/marketplace-shell', () => ({ MarketplaceShell: () => null }));
vi.mock('@/components/marketplace/account-form', () => ({ AccountForm: () => null }));
vi.mock('@/components/profile/account-email-field', () => ({ AccountEmailField: () => null }));

import NewAccountPage from './new/page';
import EditAccountPage from './[id]/page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMe.mockResolvedValue({ id: 'viewer' });
  mocks.getAccount.mockResolvedValue({ id: 'account', title: 'My account' });
  mocks.getDefinitions.mockResolvedValue([]);
});

it('keeps Accounts selected while creating or editing an account', async () => {
  expect((await NewAccountPage()).props.activeTab).toBe('accounts');
  expect((await EditAccountPage({ params: Promise.resolve({ id: 'account' }) })).props.activeTab).toBe('accounts');
});

it('keeps signed-out create and edit return destinations', async () => {
  mocks.getMe.mockResolvedValue(null);
  await expect(NewAccountPage()).rejects.toThrow('redirect:/auth/login?from=/profile/accounts/new');
  await expect(EditAccountPage({ params: Promise.resolve({ id: 'account' }) })).rejects.toThrow('redirect:/auth/login?from=/profile/accounts/account');
  expect(mocks.getAccount).not.toHaveBeenCalled();
  expect(mocks.getDefinitions).not.toHaveBeenCalled();
});
