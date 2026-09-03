import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';

export interface ChannelSummary {
  channelId: string;
  title: string;
  username: string | null;
  subscriberCount: number;
  postPriceSom: number;
}

export interface PriceBounds {
  minSom: number;
  maxSom: number;
}

export interface ChannelFunnel {
  clicks: number;
  registrations: number;
}

export interface Earnings {
  fromPostsSom: number;
  fromTradesSom: number;
  monthlySom: number;
}

export interface PostRow {
  postId: string;
  listingId: string;
  state: 'AWAITING_FUNDS' | 'HELD' | 'POSTED' | 'FAILED' | 'REFUNDED';
  priceSom: number;
  createdAt: string;
  postedAt: string | null;
}

export interface PartnerPanel {
  channel: ChannelSummary;
  priceBounds: PriceBounds;
  funnel: ChannelFunnel;
  earnings: Earnings;
  posts: PostRow[];
}

/**
 * Narx admin qo'ygan oraliqda bo'lishi kerak.
 *
 * <p>Chegaralar ekranda KO'RSATILADI, faqat rad etilmaydi: oraliqni
 * ko'rmagan hamkor nima uchun rad etilganini taxmin qilishga majbur.
 */
export function priceWithinBounds(price: number, bounds: PriceBounds): boolean {
  if (!Number.isFinite(price)) return false;
  return price >= bounds.minSom && price <= bounds.maxSom;
}

/** Postning holati hamkorga nima deyishi. */
export function postStateLabel(state: PostRow['state']): string {
  switch (state) {
    case 'AWAITING_FUNDS':
      return "To'lov kutilmoqda";
    case 'HELD':
      return 'Joylanmoqda';
    case 'POSTED':
      return 'Chiqdi';
    case 'FAILED':
      return 'Chiqmadi';
    case 'REFUNDED':
      return 'Qaytarildi';
    default:
      return state;
  }
}

/**
 * Faqat CHIQQAN post daromad keltiradi.
 *
 * <p>Ushlangan pul hali hamkorники emas — post chiqmasa sotuvchiga
 * qaytariladi.
 */
export function earnedFromPosts(posts: PostRow[]): number {
  return posts
    .filter((p) => p.state === 'POSTED')
    .reduce((sum, p) => sum + p.priceSom, 0);
}

export function formatSom(value: number | null | undefined): string {
  if (!value) return '0';
  return value.toLocaleString('uz-UZ');
}

export async function getPartnerPanel(): Promise<PartnerPanel> {
  const response = await fetch(buildMarketplaceApiPath(['v1', 'partners', 'panel']), {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Panel maʼlumotlari yuklanmadi');
  return response.json();
}

export async function updatePostPrice(priceSom: number): Promise<PartnerPanel> {
  const response = await fetch(buildMarketplaceApiPath(['v1', 'partners', 'panel', 'price']), {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ priceSom }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message ?? 'Narx saqlanmadi');
  }
  return response.json();
}
