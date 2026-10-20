import { afterEach, expect, it, vi } from 'vitest';
import { analyticsSummary, analyticsReport, analyticsExport, AnalyticsRequestError } from './seller-analytics-client';
import { formatGrossSales, formatAnalyticsDate } from './seller-analytics';
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
afterEach(() => fetchMock.mockReset());
const coverage = { collectionStartedAt: '2026-10-19T21:30:00Z', timezone: 'Asia/Samarkand', historyPartial: true };
const metrics = { uniqueViews: 1, saveAdditions: 2, inquiries: 1, completedTrades: 1, grossSalesUzs: '9007199254740993' };
const report = { days: 7, fromDate: '2026-10-14', toDate: '2026-10-20', coverage, totals: metrics, daily: [], listings: [], page: 0, size: 50, totalListings: 0 };
const summary = { listingCount: 2, uniqueViews: 30, currentFavorites: 4, inquiries: 1, coverage, capabilities: { status: 'AVAILABLE', historyDays: 90, exportEnabled: true } };
it('keeps exact integer gross sales beyond the safe numeric range and stable Samarkand dates', () => {
  expect(formatGrossSales('9007199254740993')).toBe('9 007 199 254 740 993 so‘m');
  expect(formatGrossSales('0')).toBe('0 so‘m');
  expect(formatAnalyticsDate('2026-10-19T21:30:00Z')).toBe('20.10.2026');
  expect(formatAnalyticsDate('2026-10-19')).toBe('19.10.2026');
});
it.each([undefined, {}, { status: 'AVAILABLE' }, { status: 'AVAILABLE', historyDays: -1, exportEnabled: true }, { status: 'AVAILABLE', historyDays: '90', exportEnabled: true }])('retains basic counts but never invents grants from malformed capability %j', async capabilities => {
  fetchMock.mockResolvedValue(Response.json({ ...summary, capabilities }));
  expect(await analyticsSummary()).toMatchObject({ uniqueViews: 30, capabilities: { status: 'UNAVAILABLE', exportEnabled: false } });
});
it('accepts server unlimited STAFF capability without substituting a grant', async () => {
  fetchMock.mockResolvedValue(Response.json({ ...summary, capabilities: { status: 'AVAILABLE', historyDays: null, exportEnabled: true } }));
  expect((await analyticsSummary()).capabilities.historyDays).toBeNull();
});
it.each([7, 30, 90] as const)('sends %i-day report with listing, page, cookies and abort signal', async days => {
  fetchMock.mockResolvedValue(Response.json({ ...report, days, page: 2 }));
  const signal = new AbortController().signal;
  await analyticsReport({ days, listingId: 'listing-1', page: 2 }, signal);
  expect(fetchMock).toHaveBeenCalledWith(`/api/marketplace/v1/seller-analytics/report?days=${days}&listingId=listing-1&page=2&size=50`, expect.objectContaining({ credentials: 'include', cache: 'no-store', signal }));
});
it('exports every filtered listing without report pagination and retains CSV content', async () => {
  fetchMock.mockResolvedValue(new Response('listingId,grossSalesUzs\nlisting-1,9007199254740993', { headers: { 'Content-Type': 'text/csv;charset=UTF-8' } }));
  const blob = await analyticsExport({ days: 90, listingId: 'listing-1' });
  expect(await blob.text()).toContain('9007199254740993');
  expect(fetchMock).toHaveBeenCalledWith('/api/marketplace/v1/seller-analytics/export?days=90&listingId=listing-1', expect.objectContaining({ headers: { Accept: 'text/csv, application/json' }, credentials: 'include', cache: 'no-store' }));
});
it.each([[403, 'analytics_upgrade_required'], [503, 'analytics_policy_unavailable'], [400, 'analytics_invalid_days'], [404, 'listing_not_found']] as const)('preserves %i error codes for visible recovery, never as CSV', async (status, code) => {
  fetchMock.mockImplementation(async () => Response.json({ code }, { status }));
  await expect(analyticsExport({ days: 90 })).rejects.toMatchObject({ status, code });
  await expect(analyticsSummary()).rejects.toBeInstanceOf(AnalyticsRequestError);
});
it('rejects JSON disguised as a successful export and malformed monetary report data', async () => {
  fetchMock.mockResolvedValue(Response.json({ error: 'not csv' }));
  await expect(analyticsExport({ days: 7 })).rejects.toThrow('CSV');
  fetchMock.mockResolvedValue(Response.json({ totals: { grossSalesUzs: 9007199254740992 }, daily: [], listings: [] }));
  await expect(analyticsReport({ days: 7, page: 0 })).rejects.toThrow();
});

it.each([
  { totals: { ...metrics, uniqueViews: -1 } },
  { fromDate: 'not-a-date' },
  { coverage: null },
  { listings: [{ listingId: 'private', title: 'Private title', status: 'DELETED', ...metrics }] },
  { days: 90 },
  { page: 10 },
])('rejects malformed or mismatched report data before rendering it: %j', async patch => {
  fetchMock.mockResolvedValue(Response.json({ ...report, ...patch }));
  await expect(analyticsReport({ days: 7, page: 0 })).rejects.toThrow();
});
