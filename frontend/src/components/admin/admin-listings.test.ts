// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminListings } from './admin-listings';
import type { ListingResponse, ListingStatus } from '@/lib/marketplace-types';

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), sold: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('@/lib/marketplace-actions', () => ({
  adminMarkListingSold: mocks.sold, adminDeleteListing: vi.fn(), adminRestoreListing: vi.fn(),
}));
let container: HTMLDivElement;
let root: Root;
const listing = (status: ListingStatus): ListingResponse => ({
  id: 'listing-1', sellerId: 'other-seller', description: 'Steam account', price: 250000,
  priceNegotiable: false, attributes: {}, mediaMessageIds: [], status,
  likeCount: 0, forwardCount: 0, createdAt: '2026-09-10T00:00:00Z', updatedAt: '',
});
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); vi.restoreAllMocks(); });
async function render(status: ListingStatus = 'ACTIVE') {
  await act(async () => root.render(createElement(AdminListings, { listings: [listing(status)], totalElements: 1 })));
}
const soldButton = () => Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Sotildi deb belgilash'));

describe('admin listing sold action', () => {
  it('marks another seller’s active listing sold and refreshes the panel', async () => {
    mocks.sold.mockResolvedValue({ ok: true, data: listing('SOLD') });
    await render();
    expect(soldButton()).toBeDefined();
    await act(async () => soldButton()!.click());
    expect(window.confirm).toHaveBeenCalled();
    expect(mocks.sold).toHaveBeenCalledWith('listing-1');
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it('does not submit when confirmation is cancelled', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    await render();
    await act(async () => soldButton()!.click());
    expect(mocks.sold).not.toHaveBeenCalled();
  });
  it.each(['SOLD', 'DELETED'] as const)('does not offer mark sold for %s listings', async (status) => {
    await render(status);
    expect(soldButton()).toBeUndefined();
  });
  it('shows a failed update without refreshing', async () => {
    mocks.sold.mockResolvedValue({ ok: false, status: 409, message: 'E’lon aktiv emas' });
    await render();
    await act(async () => soldButton()!.click());
    expect(container.textContent).toContain('E’lon aktiv emas');
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
