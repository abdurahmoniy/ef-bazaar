// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SellerAnalyticsView } from './seller-analytics-view';
const fetchMock = vi.fn();
let host: HTMLDivElement; let root: Root;
const coverage = { collectionStartedAt: '2026-10-19T21:30:00Z', timezone: 'Asia/Samarkand', views: 'FIRST_UNIQUE_WITH_EXISTING_HISTORY', saves: 'ADDITIONS_SINCE_COLLECTION', inquiries: 'FIRST_REQUEST_WITH_EXISTING_HISTORY', trades: 'COMPLETIONS_SINCE_COLLECTION', historyPartial: true };
const metrics = { uniqueViews: 3, saveAdditions: 2, inquiries: 1, completedTrades: 1, grossSalesUzs: '9007199254740993' };
let summary: Record<string, unknown>; let reportStatus: number; let exportStatus: number; let reports: string[];
const report = (url: string) => {
  const query = new URL(url, 'https://fixture').searchParams;
  const page = Number(query.get('page') ?? '0');
  return { days: Number(query.get('days')), fromDate: '2026-07-23', toDate: '2026-10-20', coverage, totals: metrics, daily: [{ date: '2026-10-20', ...metrics }], listings: [{ listingId: query.get('listingId') ?? (page ? 'listing-2' : 'listing-1'), title: page ? 'Steam team' : 'Mobile team', status: page ? 'SOLD' : 'ACTIVE', ...metrics }], page, size: 50, totalListings: query.has('listingId') ? 1 : 51 };
};
const createUrl = vi.fn(() => 'blob:fixture'); const revokeUrl = vi.fn(); const anchorClick = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(anchorClick);
  summary = { listingCount: 51, uniqueViews: 1234, currentFavorites: 8, inquiries: 4, capabilities: { status: 'AVAILABLE', historyDays: 90, exportEnabled: true }, coverage };
  reportStatus = 200; exportStatus = 200; reports = [];
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith('/summary')) return Response.json(summary);
    if (url.includes('/export?')) return exportStatus === 200 ? new Response('listingId,grossSalesUzs\nlisting-1,9007199254740993', { headers: { 'Content-Type': 'text/csv' } }) : Response.json({ code: exportStatus === 403 ? 'analytics_upgrade_required' : 'analytics_policy_unavailable' }, { status: exportStatus });
    reports.push(url);
    return reportStatus === 200 ? Response.json(report(url)) : Response.json({ code: reportStatus === 403 ? 'analytics_upgrade_required' : 'analytics_policy_unavailable' }, { status: reportStatus });
  });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
async function mount() { await act(async () => root.render(createElement(SellerAnalyticsView))); }
function button(label: string) { const found = [...host.querySelectorAll('button')].find(node => node.textContent === label); expect(found, label).toBeTruthy(); return found!; }
async function click(label: string) { await act(async () => button(label).click()); }
it('retains Free basic counts, explains honest collection and offers Pro history without report calls', async () => {
  summary.capabilities = { status: 'DENIED', historyDays: 0, exportEnabled: false };
  await mount();
  expect(host.textContent).toContain('1 234'); expect(host.textContent).toContain('Joriy sevimlilar');
  expect(host.querySelector('a[href="/plans"]')?.textContent).toContain('Pro');
  expect(host.textContent).toContain('20.10.2026'); expect(host.textContent).toContain('Asia/Samarkand');
  expect(host.textContent).toContain('birinchi'); expect(host.textContent).toContain('sof foyda emas');
  expect(reports).toEqual([]);
});
it('loads all date ranges, per-listing detail/reset and pages, then exports all filtered rows', async () => {
  await mount();
  expect(reports.at(-1)).toContain('days=90');
  await click('7 kun'); expect(reports.at(-1)).toContain('days=7');
  await click('30 kun'); expect(reports.at(-1)).toContain('days=30');
  await click('Keyingi'); expect(reports.at(-1)).toContain('page=1');
  await click('Steam team'); expect(reports.at(-1)).toContain('listingId=listing-2&page=0');
  await click('CSV yuklash');
  expect(fetchMock.mock.calls.find(([url]) => url.includes('/export?'))?.[0]).toBe('/api/marketplace/v1/seller-analytics/export?days=30&listingId=listing-2');
  expect(createUrl).toHaveBeenCalledOnce(); expect(anchorClick).toHaveBeenCalledOnce(); expect(revokeUrl).toHaveBeenCalledWith('blob:fixture');
  expect(host.querySelector('a[download]')).toBeNull();
  expect(host.textContent).toContain('barcha');
  await click('Barcha e’lonlar'); expect(reports.at(-1)).not.toContain('listingId=');
  expect(host.textContent).toContain('9 007 199 254 740 993 so‘m');
  expect(host.querySelector('table caption')?.textContent).toContain('Kunlik');
});
it('disables only ranges beyond the server limit and respects export=false', async () => {
  summary.capabilities = { status: 'AVAILABLE', historyDays: 30, exportEnabled: false };
  await mount();
  expect(button('90 kun').disabled).toBe(true); expect(button('30 kun').disabled).toBe(false);
  expect(reports.at(-1)).toContain('days=30'); expect(button('CSV yuklash').disabled).toBe(true);
});
it('honors unlimited server STAFF capabilities', async () => {
  summary.capabilities = { status: 'AVAILABLE', historyDays: null, exportEnabled: true };
  await mount(); expect(button('90 kun').disabled).toBe(false); expect(reports.at(-1)).toContain('days=90');
});
it('shows unknown policy and retry without upgrading or making report calls', async () => {
  summary.capabilities = { status: 'UNAVAILABLE', historyDays: 0, exportEnabled: false };
  await mount(); expect(host.textContent).toContain('aniqlanmadi'); expect(host.textContent).toContain('1 234');
  expect(host.querySelector('a[href="/plans"]')).toBeNull(); expect(reports).toEqual([]);
  summary.capabilities = { status: 'AVAILABLE', historyDays: 90, exportEnabled: true };
  await click('Qayta urinish'); expect(reports.at(-1)).toContain('days=90');
});
it.each([403, 503])('clears stale paid rows after %i, retains basic counts and recovers via retry', async status => {
  await mount(); expect(host.textContent).toContain('Mobile team');
  reportStatus = status; await click('7 kun');
  expect(host.textContent).not.toContain('Mobile team'); expect(host.textContent).toContain('1 234');
  expect(host.querySelector('[role="alert"]')).toBeTruthy();
  expect(Boolean(host.querySelector('a[href="/plans"]'))).toBe(status === 403);
  reportStatus = 200; await click('Qayta urinish'); expect(host.textContent).toContain('Mobile team');
});
it('does not replace a failed summary with zero or an empty seller state', async () => {
  fetchMock.mockResolvedValue(Response.json({ code: 'unavailable' }, { status: 503 }));
  await mount(); expect(host.querySelector('[role="alert"]')).toBeTruthy();
  expect(host.textContent).not.toContain('Hozircha e’lon yo‘q'); expect(host.textContent).not.toContain('Joriy sevimlilar');
});
it('shows partial collection and a new empty report without promising a complete history', async () => {
  fetchMock.mockImplementation(async (url: string) => Response.json(url.endsWith('/summary') ? { ...summary, listingCount: 0, uniqueViews: 0, inquiries: 0, currentFavorites: 0 } : { ...report(url), listings: [], daily: [], totalListings: 0, totals: { uniqueViews: 0, saveAdditions: 0, inquiries: 0, completedTrades: 0, grossSalesUzs: '0' } }));
  await mount(); expect(host.textContent).toContain('qisman'); expect(host.textContent).toContain('Hozircha e’lon yo‘q');
  expect(host.textContent).toContain('20.10.2026'); expect(host.textContent).not.toContain('90 kunlik tarix tayyor');
});
it('ignores an older response even if transport does not honor abort', async () => {
  let finish!: (response: Response) => void;
  const normal = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url: string, init: RequestInit) => url.includes('days=7') && url.includes('/report') ? new Promise(resolve => { finish = resolve; }) : normal(url, init));
  await mount(); await click('7 kun');
  const signal = fetchMock.mock.calls.find(([url]) => url.includes('/report?days=7'))![1].signal;
  await click('30 kun'); expect(signal.aborted).toBe(true);
  await act(async () => finish(Response.json({ ...report('/report?days=7'), listings: [{ ...metrics, listingId: 'old', title: 'STALE ROW', status: 'ACTIVE' }] })));
  expect(host.textContent).not.toContain('STALE ROW'); expect(button('30 kun').getAttribute('aria-pressed')).toBe('true');
});
it('does not download a failed export, clears revoked report, and protects export filter races', async () => {
  await mount(); exportStatus = 503; await click('CSV yuklash');
  expect(createUrl).not.toHaveBeenCalled(); expect(anchorClick).not.toHaveBeenCalled(); expect(host.querySelector('[role="alert"]')).toBeTruthy();
  expect(host.textContent).not.toContain('Mobile team'); expect(host.textContent).toContain('1 234');
  exportStatus = 200; await click('Qayta urinish');
  let finish!: (response: Response) => void;
  const normal = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url: string, init: RequestInit) => url.includes('/export?') ? new Promise(resolve => { finish = resolve; }) : normal(url, init));
  await click('CSV yuklash'); await click('7 kun');
  await act(async () => finish(new Response('old csv', { headers: { 'Content-Type': 'text/csv' } })));
  expect(createUrl).not.toHaveBeenCalled(); expect(anchorClick).not.toHaveBeenCalled();
});
it('returns to the first page on refresh when the final listing page disappears, preserving the chosen range', async () => {
  let removed = false;
  const normal = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url: string, init: RequestInit) => {
    if (removed && url.includes('/report?')) {
      const data = report(url);
      return Response.json({ ...data, totalListings: 50, listings: data.page ? [] : data.listings });
    }
    return normal(url, init);
  });
  await mount(); await click('30 kun'); await click('Keyingi');
  expect(host.textContent).toContain('Steam team');
  removed = true; await click('Yangilash');
  expect(reports.at(-1)).toContain('days=30');
  expect(host.textContent).toContain('Mobile team');
  expect(host.textContent).not.toContain('Hozircha e’lon yo‘q');
  const lastReportUrl = fetchMock.mock.calls.filter(([url]) => url.includes('/report?')).at(-1)![0];
  expect(lastReportUrl).toContain('days=30&page=0&size=50');
});
