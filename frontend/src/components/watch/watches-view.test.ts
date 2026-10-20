// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WatchesView } from './watches-view';
const fetchMock = vi.fn();
let host: HTMLDivElement; let root: Root;
const search = { id: 's1', name: 'Messi', matchCard: [], matchStrictness: 4, minPrice: 0, maxPrice: 100000, paused: false, pauseReason: null, priority: 0, notificationsEnabled: true, createdAt: '' };
const price = { id: 'p1', listingId: 'l1', paused: true, pauseReason: 'LIMIT', priority: 0, createdAt: '' };
let searches: unknown; let prices: unknown;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('fetch', fetchMock);
  searches = { items: [search], limit: 1, immediate: false, available: true };
  prices = { items: [price], limit: 3, immediate: false, available: true, notificationsEnabled: false, telegramEnabled: false };
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    if (init.method !== 'GET') return new Response(null, { status: 204 });
    return Response.json(url.includes('saved-searches') ? searches : prices);
  });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.resetAllMocks(); });
async function mount(initialQuery = '') { await act(async () => root.render(createElement(WatchesView, { initialQuery }))); }
async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find(b => b.textContent?.includes(text));
  expect(button, text).toBeTruthy(); await act(async () => button!.click());
}
it('shows real limits/cadence, preserved quota-paused data and separate price notification opt-in', async () => {
  await mount();
  expect(host.textContent).toContain('1 / 1'); expect(host.textContent).toContain('0 / 3');
  expect(host.textContent).toContain('19:00'); expect(host.textContent).toContain('Asia/Samarkand');
  expect(host.textContent).toContain('Limit sabab pauzada'); expect(host.textContent).toContain('o‘chirilmaydi');
  expect(host.querySelector('a[href="/marketplace/l1"]')).toBeTruthy();
  const checkbox = host.querySelector<HTMLInputElement>('input[aria-label="Narx xabarlari"]')!;
  expect(checkbox.checked).toBe(false);
  await act(async () => checkbox.click());
  expect(fetchMock).toHaveBeenCalledWith('/api/marketplace/v1/price-watches/preferences', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ notificationsEnabled: true, telegramEnabled: false }) }));
});
it('sends owner pause, primary ordering and delete commands', async () => {
  await mount(); await click('Pauza qilish');
  expect(fetchMock).toHaveBeenCalledWith('/api/rec/v1/saved-searches/s1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ paused: true }) }));
  await click('Asosiy qilish');
  expect(fetchMock).toHaveBeenCalledWith('/api/rec/v1/saved-searches/priorities', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ ids: ['s1'] }) }));
  await click('O‘chirish');
  expect(fetchMock).toHaveBeenCalledWith('/api/rec/v1/saved-searches/s1', expect.objectContaining({ method: 'DELETE' }));
});
it('saves only supported current filters and the explicit notification choice', async () => {
  searches = { items: [], limit: 1, immediate: false, available: true };
  await mount('minPrice=100&maxPrice=200&platform=STEAM&search=Messi');
  expect(host.textContent).toContain('Platforma, matn va boshqa filtrlar saqlanmaydi');
  const form = host.querySelector('form')!;
  await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(fetchMock).toHaveBeenCalledWith('/api/rec/v1/saved-searches', expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Saqlangan qidiruv', matchCard: [], matchStrictness: 4, minPrice: 100, maxPrice: 200, notificationsEnabled: true }) }));
});
it('keeps failures visible and disables allocation/resume when capabilities are unavailable, while allowing delete', async () => {
  searches = { items: [search], limit: null, immediate: false, available: false };
  prices = { items: [price], limit: null, immediate: false, available: false, notificationsEnabled: false, telegramEnabled: false };
  await mount();
  expect(host.textContent).toContain('aniqlanmadi');
  expect([...host.querySelectorAll('button')].find(b => b.textContent?.includes('Davom ettirish'))?.disabled).toBe(true);
  fetchMock.mockImplementation(async (_url: string, init: RequestInit) => init.method === 'DELETE' ? Response.json({ message: 'Delete failed' }, { status: 500 }) : Response.json(searches));
  await click('O‘chirish');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Delete failed');
  expect(host.textContent).toContain('Messi');
});
it('shows a retryable service failure rather than an empty saved-search list', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
  await mount();
  expect(host.querySelector('[role="alert"]')).toBeTruthy();
  expect(host.textContent).toContain('Qayta urinish');
  expect(host.textContent).not.toContain('Hali qidiruv yo‘q');
});
it('edits price criteria without losing cards and resumes a paused owner watch', async () => {
  const card = '101:00000000-0000-4000-8000-000000000001:P';
  searches = { items: [{ ...search, matchCard: [card], matchStrictness: 7 }], limit: 5, immediate: true, available: true };
  await mount();
  await click('Davom ettirish');
  expect(fetchMock).toHaveBeenCalledWith('/api/marketplace/v1/price-watches/p1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ paused: false }) }));
  await click('Tahrirlash');
  const form = host.querySelector('form')!;
  await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(fetchMock).toHaveBeenCalledWith('/api/rec/v1/saved-searches/s1', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ name: 'Messi', matchCard: [card], matchStrictness: 7, minPrice: 0, maxPrice: 100000, notificationsEnabled: true }) }));
});
it('requires a card or price bound for creation and makes no unsupported broad watch', async () => {
  searches = { items: [], limit: 1, immediate: false, available: true };
  await mount('search=Messi&platform=STEAM');
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('kartalari yoki narx');
  expect(fetchMock.mock.calls.every(([, init]) => init.method === 'GET')).toBe(true);
});
it('continues to load the other service when one watch service fails', async () => {
  fetchMock.mockImplementation(async (url: string) => url.includes('saved-searches') ? new Response(null, { status: 503 }) : Response.json(prices));
  await mount();
  expect(host.querySelector('[role="alert"]')).toBeTruthy();
  expect(host.querySelector('a[href="/marketplace/l1"]')).toBeTruthy();
});
it('counts a paused saved search toward the Free create quota while preserving editing', async () => {
  searches = { items: [{ ...search, paused: true, pauseReason: 'USER' }], limit: 1, immediate: false, available: true };
  await mount('minPrice=100');
  expect([...host.querySelectorAll('button')].find(b => b.textContent === 'Saqlash')?.disabled).toBe(true);
  expect(host.textContent).toContain('Pauzadagilar ham');
  await click('Tahrirlash');
  expect([...host.querySelectorAll('button')].find(b => b.textContent === 'Saqlash')?.disabled).toBe(false);
});
