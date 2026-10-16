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

it('returns to a custom-mailbox link page after saving, and nowhere else', async () => {
  const back = '/mailboxes/custom/0b7c1d5e-2f3a-4b6c-9d8e-112233445566/link';
  const form = (page: Awaited<ReturnType<typeof NewAccountPage>>) =>
    JSON.stringify(page.props.children, (_k, v) => (typeof v === 'function' ? undefined : v));
  expect(form(await NewAccountPage({ searchParams: Promise.resolve({ returnTo: back }) }))).toContain(back);
  expect(form(await NewAccountPage({ searchParams: Promise.resolve({ returnTo: 'https://evil.example/x' }) }))).not.toContain('evil');
});

it('keeps signed-out create and edit return destinations', async () => {
  mocks.getMe.mockResolvedValue(null);
  await expect(NewAccountPage()).rejects.toThrow('redirect:/auth/login?from=/profile/accounts/new');
  await expect(EditAccountPage({ params: Promise.resolve({ id: 'account' }) })).rejects.toThrow('redirect:/auth/login?from=/profile/accounts/account');
  expect(mocks.getAccount).not.toHaveBeenCalled();
  expect(mocks.getDefinitions).not.toHaveBeenCalled();
});

it('does not open the editor for a sold account', async () => {
  mocks.getAccount.mockResolvedValue({ id: 'account', title: 'Sotilgan', status: 'ARCHIVED' });
  await expect(EditAccountPage({ params: Promise.resolve({ id: 'account' }) }))
    .rejects.toThrow('redirect:/profile?tab=accounts');
});
