// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ sold: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }) }));
vi.mock('@/app/auth/actions', () => ({ linkTelegramAction: vi.fn() }));
vi.mock('@/lib/marketplace-actions', () => ({ markListingSold: mocks.sold, relistListing: vi.fn(), toggleListingLike: vi.fn() }));
import { ListingActions } from './listing-actions';
let host: HTMLDivElement; let root: Root;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.clearAllMocks(); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const button = (text: string) => Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === text)!;
async function render(variant: 'panel' | 'bar', buyerPreview = false) {
  await act(async () => root.render(createElement(ListingActions, { listingId: 'listing-1', listingTitle: 'Public title', authenticated: true, isOwner: true, initialLikeCount: 0, variant, buyerPreview })));
}
it.each(['panel', 'bar'] as const)('%s requires confirmation and supports cancellation before marking sold', async variant => {
  mocks.sold.mockResolvedValue({ ok: true }); await render(variant);
  expect(host.textContent).toContain('Ulashish');
  const menu = host.querySelector('summary'); expect(menu).not.toBeNull();
  await act(async () => menu!.click());
  await act(async () => button('Sotilgan deb belgilash').click());
  expect(mocks.sold).not.toHaveBeenCalled();
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('xaridorlarga sotilgan');
  await act(async () => button('Bekor qilish').click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(mocks.sold).not.toHaveBeenCalled();
  await act(async () => button('Sotilgan deb belgilash').click());
  await act(async () => button('Ha, sotilgan deb belgilash').click());
  expect(mocks.sold).toHaveBeenCalledExactlyOnceWith('listing-1');
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
it('keeps failure feedback inside the confirmation and allows retry', async () => {
  mocks.sold.mockResolvedValue({ ok: false, message: 'Server unavailable' }); await render('bar');
  await act(async () => button('Sotilgan deb belgilash').click());
  await act(async () => button('Ha, sotilgan deb belgilash').click());
  expect(document.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain('Server unavailable');
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it('buyer preview does not allow an owner to contact themselves or change listing state', async () => {
  await render('bar', true);
  expect(host.textContent).not.toContain('Tahrirlash');
  expect(host.querySelector('button')?.disabled).toBe(true);
  expect(host.textContent).toContain('Bog‘lanish');
});
it('disables confirmation while saving and reports network failures accessibly', async () => {
  let reject!: (error: Error) => void;
  mocks.sold.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
  await render('bar');
  await act(async () => button('Sotilgan deb belgilash').click());
  await act(async () => button('Ha, sotilgan deb belgilash').click());
  expect(button('Belgilanmoqda…').disabled).toBe(true);
  expect(button('Bekor qilish').disabled).toBe(true);
  await act(async () => reject(new Error('offline')));
  expect(document.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain('Tarmoq xatoligi');
  expect(button('Ha, sotilgan deb belgilash').disabled).toBe(false);
});
