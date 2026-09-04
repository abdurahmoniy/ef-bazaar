import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';
import type { PartnerApplication } from '@/lib/partners';

/**
 * Hamkor paneli shu odamga ochiladimi.
 *
 * <p>ROLGA QARAMAYDI, va bu ataylab. Rollar bitta qiymatli: odam yo
 * USER, yo ADMIN, yo TRADE_ADMIN, yo PARTNER. Shuning uchun
 * PartnerApprovedConsumer adminning rolini tegmay o'tadi — uni PARTNER
 * qilsa admin panelini yo'qotardi. Natijada tasdiqlangan hamkor admin
 * hech qachon ROLE_PARTNER olmaydi.
 *
 * <p>Rolga qarasak u o'z paneliga kira olmasdi: havola bosilganda
 * /partnership ga qaytarilar va u yerda yana "Siz hamkorsiz" deb
 * turardi — havola o'lgandek ko'rinardi.
 *
 * <p>Ariza holati esa /partnership "Siz hamkorsiz" deganda qaraydigan
 * aynan o'sha manba. Ikkala sahifa bitta faktga tayanadi va bir-biriga
 * zid gapira olmaydi.
 */
export function canOpenPartnerPanel(application: PartnerApplication | null): boolean {
  return application?.status === 'APPROVED';
}

export interface ChannelSummary {
  channelId: string;
  title: string;
  username: string | null;
  subscriberCount: number;
  postPriceSom: number;
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

/**
 * Hamkorga qanday shart qo'llanadi.
 *
 * <p>Hamkor buni O'ZGARTIRA OLMAYDI — admin sozlaydi. Lekin ko'radi:
 * qaysi shartda ekanini bilmagan odam daromadidagi raqamni tushuntira
 * olmaydi.
 */
export interface PayoutTerms {
  mode: 'PERCENT' | 'FIXED';
  /** Foizda, ko'rsatish uchun. FIXED rejimda 0. */
  tradePercent: number;
  fixedMonthlySom: number;
}

export interface PartnerPanel {
  channel: ChannelSummary;
  terms: PayoutTerms;
  funnel: ChannelFunnel;
  earnings: Earnings;
  posts: PostRow[];
}

/**
 * Narx hamkorning o'z ishi — yuqori chegara yo'q.
 *
 * <p>Qimmat kanal shunchaki tanlanmaydi, va buni bozorning o'zi hal
 * qiladi. Manfiy narx esa narx emas: u sotuvchiga pul to'lash bo'lardi.
 */
export function isValidPostPrice(price: number): boolean {
  return Number.isFinite(price) && price >= 0;
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

/**
 * Amaldagi shartni bir jumlada aytadi.
 *
 * <p>Ikki rejim bir-birini almashtiradi, shuning uchun ikkalasini
 * birga ko'rsatish hamkorni chalg'itardi — u ikkalasini ham olaman
 * deb o'ylardi.
 */
export function describeTerms(terms: PayoutTerms): string {
  if (terms.mode === 'FIXED') {
    return `Oyiga ${formatSom(terms.fixedMonthlySom)} so'm`;
  }
  return `Har savdodan ${terms.tradePercent}% (efBazaar komissiyasidan)`;
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
