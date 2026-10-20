import type { AnalyticsCapabilities, AnalyticsCoverage, AnalyticsFilter, AnalyticsMetrics, AnalyticsReport, AnalyticsSummary } from './seller-analytics';
const BASE = '/api/marketplace/v1/seller-analytics';
const unavailable: AnalyticsCapabilities = { status: 'UNAVAILABLE', historyDays: 0, exportEnabled: false };
export class AnalyticsRequestError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, message: string) { super(message); }
}
function capability(value: unknown): AnalyticsCapabilities {
  if (!value || typeof value !== 'object') return unavailable;
  const c = value as AnalyticsCapabilities;
  if (typeof c.exportEnabled !== 'boolean') return unavailable;
  if (c.status === 'DENIED' && c.historyDays === 0 && !c.exportEnabled) return c;
  if (c.status === 'AVAILABLE' && (c.historyDays === null || Number.isInteger(c.historyDays) && c.historyDays > 0)) return c;
  return unavailable;
}
async function request(suffix: string, csv: boolean, signal?: AbortSignal) {
  const response = await fetch(`${BASE}/${suffix}`, { credentials: 'include', cache: 'no-store', headers: { Accept: csv ? 'text/csv, application/json' : 'application/json' }, signal });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const code = payload && typeof payload === 'object' && 'code' in payload && typeof payload.code === 'string' ? payload.code : undefined;
    const message = code === 'analytics_upgrade_required' ? 'Hisobotga kirish uchun Pro imkoniyati kerak. Tarif holatini yangilang.'
      : code === 'analytics_policy_unavailable' || response.status === 503 ? 'Hisobot imkoniyati aniqlanmadi. Qayta urinib ko‘ring.'
      : response.status === 403 || response.status === 401 ? 'Kirish huquqi tekshirilmadi. Qayta kiring yoki qayta urinib ko‘ring.'
      : code === 'listing_not_found' ? 'E’lon topilmadi yoki hisobot uchun mavjud emas. Barcha e’lonlarga qayting.'
      : 'Hisobotni yuklab bo‘lmadi. Qayta urinib ko‘ring.';
    throw new AnalyticsRequestError(response.status, code, message);
  }
  const contentType = response.headers.get('Content-Type') ?? '';
  if (!contentType.toLowerCase().startsWith(csv ? 'text/csv' : 'application/json')) throw new Error(csv ? 'CSV fayli olinmadi. Qayta urinib ko‘ring.' : 'Hisobot javobi yaroqsiz. Qayta urinib ko‘ring.');
  return response;
}
function validCoverage(c: AnalyticsCoverage) {
  return c && typeof c.collectionStartedAt === 'string' && Number.isFinite(Date.parse(c.collectionStartedAt)) && c.timezone === 'Asia/Samarkand' && typeof c.historyPartial === 'boolean';
}
function validDate(value: string) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function validMetrics(row: AnalyticsMetrics) {
  return row && [row.uniqueViews, row.saveAdditions, row.inquiries, row.completedTrades].every(n => Number.isSafeInteger(n) && n >= 0) && typeof row.grossSalesUzs === 'string' && /^(0|[1-9]\d*)$/.test(row.grossSalesUzs);
}
export async function analyticsSummary(signal?: AbortSignal): Promise<AnalyticsSummary> {
  const data = await (await request('summary', false, signal)).json() as AnalyticsSummary;
  if (!data || ![data.listingCount, data.uniqueViews, data.currentFavorites, data.inquiries].every(n => Number.isInteger(n) && n >= 0) || !validCoverage(data.coverage)) throw new Error('Asosiy statistika olinmadi. Qayta urinib ko‘ring.');
  return { ...data, capabilities: capability(data.capabilities) };
}
function query(filter: AnalyticsFilter) {
  const params = new URLSearchParams({ days: String(filter.days) });
  if (filter.listingId) params.set('listingId', filter.listingId);
  return params;
}
export async function analyticsReport(filter: AnalyticsFilter & { page: number }, signal?: AbortSignal): Promise<AnalyticsReport> {
  const params = query(filter); params.set('page', String(filter.page)); params.set('size', '50');
  const data = await (await request(`report?${params}`, false, signal)).json() as AnalyticsReport;
  if (!data || data.days !== filter.days || data.page !== filter.page || data.size !== 50 || !Number.isSafeInteger(data.totalListings) || data.totalListings < 0 || !validDate(data.fromDate) || !validDate(data.toDate) || !validCoverage(data.coverage) || !validMetrics(data.totals) || !Array.isArray(data.daily) || !Array.isArray(data.listings) || !data.daily.every(row => validMetrics(row) && validDate(row.date)) || !data.listings.every(row => validMetrics(row) && typeof row.listingId === 'string' && typeof row.title === 'string' && (row.status === 'ACTIVE' || row.status === 'SOLD') && (!filter.listingId || row.listingId === filter.listingId))) throw new Error('Hisobot javobi yaroqsiz. Qayta urinib ko‘ring.');
  return data;
}
export async function analyticsExport(filter: AnalyticsFilter, signal?: AbortSignal): Promise<Blob> {
  return (await request(`export?${query(filter)}`, true, signal)).blob();
}
