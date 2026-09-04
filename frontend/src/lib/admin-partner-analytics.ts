import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';

export interface PartnerFunnelRow {
  channelId: string;
  title: string;
  subscriberCount: number;
  active: boolean;
  clicks: number;
  registrations: number;
  postsOrdered: number;
  postsDelivered: number;
  postsRefunded: number;
  revenueSom: number;
}

/**
 * Bosilishlardan savdoga o'tish foizi.
 *
 * <p>Hech kim bosmagan kanal 0% EMAS, chiziqcha: nol bosishdan foiz
 * hisoblab bo'lmaydi, va 0% "yomon ishlayapti" degan noto'g'ri xulosa
 * beradi — u sinab ko'rilmagan.
 */
export function conversionRate(row: { clicks: number; postsDelivered: number }): string {
  if (!row.clicks) return '—';
  return `${((row.postsDelivered / row.clicks) * 100).toFixed(1)}%`;
}

export function sortByRevenue<T extends { revenueSom: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.revenueSom - a.revenueSom);
}

/**
 * Voronkaning qaysi bosqichi to'silganini bir so'z bilan aytadi.
 *
 * <p>Bitta daromad ustuni adminga kanal nima uchun ishlamayotganini
 * ayta olmaydi: ko'p bosilib savdosiz qolgani va umuman bosilmagani —
 * ikki xil muammo va ikki xil yechim.
 */
export function funnelVerdict(row: PartnerFunnelRow): string {
  if (row.postsOrdered === 0) return "E'lon joylanmagan";
  if (row.clicks === 0) return 'Bosilmagan';
  if (row.postsDelivered === 0) return 'Chiqmagan';
  return 'Ishlayapti';
}

export function formatSom(value: number): string {
  if (!value) return '—';
  return value.toLocaleString('uz-UZ');
}

export async function getPartnerFunnel(): Promise<PartnerFunnelRow[]> {
  const response = await fetch(buildMarketplaceApiPath(['v1', 'admin', 'partners', 'analytics']), {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Analitika yuklanmadi');
  return response.json();
}
