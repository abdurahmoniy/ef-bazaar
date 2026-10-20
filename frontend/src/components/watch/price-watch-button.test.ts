// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PriceWatchButton } from './price-watch-button';
const fetchMock = vi.fn(); let host: HTMLDivElement; let root: Root;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('fetch', fetchMock); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.resetAllMocks(); vi.unstubAllGlobals(); });
it('requires a separate explicit price-watch click, preserves Favorites, and shows notification settings', async () => {
  fetchMock.mockResolvedValue(Response.json({ id: 'p1' }));
  await act(async () => root.render(createElement(PriceWatchButton, { listingId: 'listing-one', authenticated: true })));
  expect(fetchMock).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Narxni kuzatish');
  await act(async () => host.querySelector('button')!.click());
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/marketplace/v1/price-watches', expect.objectContaining({ method: 'POST', body: JSON.stringify({ listingId: 'listing-one' }) }));
  expect(host.querySelector('a[href="/watches"]')).toBeTruthy();
  expect(host.textContent).toContain('saqlandi');
});
it('keeps allocation failures visible and allows retry without falsely marking watched', async () => {
  fetchMock.mockResolvedValue(Response.json({ code: 'watch_limit' }, { status: 409 }));
  await act(async () => root.render(createElement(PriceWatchButton, { listingId: 'listing-one', authenticated: true })));
  await act(async () => host.querySelector('button')!.click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('limit');
  expect(host.querySelector('button')?.disabled).toBe(false);
  expect(host.textContent).not.toContain('saqlandi');
});
it('sends guests to sign in without posting a watch', async () => {
  await act(async () => root.render(createElement(PriceWatchButton, { listingId: 'listing-one', authenticated: false })));
  expect(host.querySelector('a')?.getAttribute('href')).toContain('/auth/login?from=');
  expect(fetchMock).not.toHaveBeenCalled();
});
it('prevents duplicate creation while the first explicit request is in flight', async () => {
  let finish!: (response: Response) => void;
  fetchMock.mockReturnValue(new Promise<Response>(resolve => { finish = resolve; }));
  await act(async () => root.render(createElement(PriceWatchButton, { listingId: 'listing-one', authenticated: true })));
  await act(async () => { host.querySelector('button')!.click(); host.querySelector('button')!.click(); });
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(host.querySelector('button')!.disabled).toBe(true);
  await act(async () => finish(Response.json({ id: 'p1' })));
  expect(host.textContent).toContain('saqlandi');
});
it('bootstraps a missing authoritative Free projection only after its explicit unavailable response, then asks for retry', async () => {
  fetchMock.mockResolvedValueOnce(Response.json({code:'watch_entitlement_unavailable'},{status:503}))
    .mockResolvedValueOnce(Response.json({code:'STANDARD',expiresAt:null,entitlements:{}}))
    .mockResolvedValueOnce(Response.json({id:'p1'}));
  await act(async()=>root.render(createElement(PriceWatchButton,{listingId:'listing-one',authenticated:true})));
  await act(async()=>host.querySelector('button')!.click());
  expect(fetchMock).toHaveBeenNthCalledWith(2,'/api/payment/v1/payments/plans/me',expect.objectContaining({credentials:'include',cache:'no-store'}));
  expect(host.textContent).toContain('Tarif yangilanmoqda');
  expect(host.textContent).not.toContain('Kuzatuv saqlandi');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await act(async()=>host.querySelector('button')!.click());
  expect(host.textContent).toContain('Kuzatuv saqlandi');
});
it('does not turn payment bootstrap failure into a Free grant or silently retry creation', async () => {
  fetchMock.mockResolvedValueOnce(Response.json({code:'watch_entitlement_unavailable'},{status:503}))
    .mockResolvedValueOnce(new Response(null,{status:503}));
  await act(async()=>root.render(createElement(PriceWatchButton,{listingId:'listing-one',authenticated:true})));
  await act(async()=>host.querySelector('button')!.click());
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(host.querySelector('[role="alert"]')).toBeTruthy();
  expect(host.textContent).not.toContain('Kuzatuv saqlandi');
});
