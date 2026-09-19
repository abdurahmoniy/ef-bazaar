// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { refresh, relist, toggleLike } = vi.hoisted(() => ({ refresh: vi.fn(), relist: vi.fn(), toggleLike: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));
vi.mock('@/app/auth/actions', () => ({ linkTelegramAction: vi.fn() }));
vi.mock('@/lib/marketplace-actions', () => ({
  relistListing: relist,
  markListingSold: vi.fn(),
  toggleListingLike: toggleLike,
}));

import { ListingActions } from './listing-actions';

let host: HTMLDivElement;
let root: Root;
const label = "Qayta sotuvga qo'yish";

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function render(variant: 'panel' | 'bar', isOwner = true, status: 'SOLD' | 'ACTIVE' = 'SOLD') {
  await act(async () => root.render(createElement(ListingActions, {
    listingId: 'listing-1', authenticated: true, telegramLinked: true,
    isOwner, initialLikeCount: 0, status, variant, priceLabel: "300 000 so'm",
  })));
}

function relistButton() {
  return Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes(label));
}

describe.each(['panel', 'bar'] as const)('seller relisting in %s', variant => {
  it('lets the owner relist and refreshes the listing after success', async () => {
    relist.mockResolvedValue({ ok: true, data: { status: 'ACTIVE' } });
    await render(variant);
    expect(relistButton()).toBeDefined();
    await act(async () => relistButton()!.click());
    expect(relist).toHaveBeenCalledWith('listing-1');
    expect(refresh).toHaveBeenCalledOnce();
    expect(relistButton()).toBeUndefined();
    expect(host.textContent).toContain('Tahrirlash');
  });

  it('keeps the sold state and displays errors when relisting fails', async () => {
    relist.mockResolvedValue({ ok: false, status: 409, message: "Qayta sotuvga qo'yilmadi" });
    await render(variant);
    expect(relistButton()).toBeDefined();
    await act(async () => relistButton()!.click());
    expect(host.textContent).toContain("Qayta sotuvga qo'yilmadi");
    expect(relistButton()).toBeDefined();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('disables the button while the request is pending', async () => {
    let complete!: (value: unknown) => void;
    relist.mockReturnValue(new Promise(resolve => { complete = resolve; }));
    await render(variant);
    const button = relistButton();
    expect(button).toBeDefined();
    await act(async () => button!.click());
    expect(button!.disabled).toBe(true);
    await act(async () => complete({ ok: true, data: { status: 'ACTIVE' } }));
  });

  it('does not offer relisting to other viewers', async () => {
    await render(variant, false);
    expect(relistButton()).toBeUndefined();
  });

  it('does not offer relisting for an active listing', async () => {
    await render(variant, true, 'ACTIVE');
    expect(relistButton()).toBeUndefined();
  });

  it('syncs the other action panel when refreshed listing status changes', async () => {
    await render(variant);
    await render(variant, true, 'ACTIVE');
    expect(relistButton()).toBeUndefined();
    expect(host.textContent).toContain('Tahrirlash');
  });
});

describe('listing detail favorite cache', () => {
  it('invalidates visited listings after a confirmed favorite and syncs refreshed props', async () => {
    await render('bar', false, 'ACTIVE');
    toggleLike.mockResolvedValue({ ok: true, data: { liked: true, totalLikes: 1 } });
    const favorite = host.querySelector<HTMLButtonElement>('button[aria-pressed]')!;
    await act(async () => favorite.click());
    expect(refresh).toHaveBeenCalledOnce();
    expect(favorite.getAttribute('aria-pressed')).toBe('true');
    await act(async () => root.render(createElement(ListingActions, {
      listingId: 'listing-1', authenticated: true, initialLiked: false, initialLikeCount: 2, variant: 'bar',
    })));
    expect(favorite.getAttribute('aria-pressed')).toBe('false');
  });
});
