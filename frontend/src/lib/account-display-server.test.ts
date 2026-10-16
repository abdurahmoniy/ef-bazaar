import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), getListing: vi.fn() }));
vi.mock('./api', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('./marketplace-server', () => ({ getListing: mocks.getListing }));
import { getAccountDisplayData } from './account-display-server';
import type { UserAccountResponse } from './accounts-types';

const accounts = [
  { id: 'one', email: ' OWNED@efbazaar.uz ', onMarket: true, currentListingId: 'listing-1' },
  { id: 'two', email: 'other@efbazaar.uz', onMarket: false, currentListingId: 'old-listing' },
] as UserAccountResponse[];
beforeEach(() => vi.resetAllMocks());

it('links only matching owned mailboxes and prices only the current published listing', async () => {
  mocks.apiFetch.mockResolvedValue([{ id: 'mail-1', email: 'owned@efbazaar.uz' }]);
  mocks.getListing.mockResolvedValue({ ok: true, data: { id: 'listing-1', sellerId: 'viewer', price: 0 } });
  expect(await getAccountDisplayData(accounts, 'viewer')).toEqual({
    // Not verified yet and the box is the viewer's own: it can be verified.
    one: { mailboxHref: '/mail/mail-1', verifyMailboxId: 'mail-1', price: 0 }, two: {},
  });
  expect(mocks.getListing).toHaveBeenCalledExactlyOnceWith('listing-1');
});

it('offers no verification for an address already verified', async () => {
  mocks.apiFetch.mockResolvedValue([{ id: 'mail-1', email: 'owned@efbazaar.uz' }]);
  mocks.getListing.mockResolvedValue({ ok: true, data: { id: 'listing-1', sellerId: 'viewer', price: 0 } });
  const verified = accounts.map((a) => ({ ...a, emailVerified: true }));
  const display = await getAccountDisplayData(verified, 'viewer');
  expect(display.one).not.toHaveProperty('verifyMailboxId');
});

it('keeps accounts usable when optional services are unavailable', async () => {
  mocks.apiFetch.mockRejectedValue(new Error('mail offline'));
  mocks.getListing.mockResolvedValue({ ok: false, error: { status: 503 } });
  expect(await getAccountDisplayData(accounts, 'viewer')).toEqual({ one: {}, two: {} });
});

it('does not use another seller listing or fetch supplemental data for no accounts', async () => {
  mocks.apiFetch.mockResolvedValue([]);
  mocks.getListing.mockResolvedValue({ ok: true, data: { sellerId: 'someone-else', price: 12 } });
  expect((await getAccountDisplayData(accounts, 'viewer')).one).toEqual({});
  vi.clearAllMocks();
  expect(await getAccountDisplayData([], 'viewer')).toEqual({});
  expect(mocks.apiFetch).not.toHaveBeenCalled();
});
