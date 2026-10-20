export type AnalyticsDays = 7 | 30 | 90;
export interface AnalyticsCapabilities {
  status: 'AVAILABLE' | 'DENIED' | 'UNAVAILABLE';
  historyDays: number | null;
  exportEnabled: boolean;
}
export interface AnalyticsCoverage {
  collectionStartedAt: string;
  timezone: string;
  views: string;
  saves: string;
  inquiries: string;
  trades: string;
  historyPartial: boolean;
}
export interface AnalyticsSummary {
  listingCount: number;
  uniqueViews: number;
  currentFavorites: number;
  inquiries: number;
  capabilities: AnalyticsCapabilities;
  coverage: AnalyticsCoverage;
}
export interface AnalyticsMetrics {
  uniqueViews: number;
  saveAdditions: number;
  inquiries: number;
  completedTrades: number;
  /** Exact integer so‘m from the server; never convert to Number. */
  grossSalesUzs: string;
}
export interface AnalyticsReport {
  days: AnalyticsDays;
  fromDate: string;
  toDate: string;
  coverage: AnalyticsCoverage;
  totals: AnalyticsMetrics;
  daily: (AnalyticsMetrics & { date: string })[];
  listings: (AnalyticsMetrics & { listingId: string; title: string; status: 'ACTIVE' | 'SOLD' })[];
  page: number;
  size: number;
  totalListings: number;
}
export interface AnalyticsFilter { days: AnalyticsDays; listingId?: string }
export const ANALYTICS_DAYS: AnalyticsDays[] = [7, 30, 90];
export function canReadAnalytics(c: AnalyticsCapabilities, days: AnalyticsDays) {
  return c.status === 'AVAILABLE' && (c.historyDays === null || c.historyDays >= days);
}
export function formatGrossSales(value: string) {
  return `${value.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so‘m`;
}
/** Report dates are already Samarkand days. Instants use its fixed UTC+5. */
export function formatAnalyticsDate(value: string) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date(new Date(value).getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [year, month, day] = dateOnly.split('-');
  return `${day}.${month}.${year}`;
}
