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

/** Postdagi bloklar. Kalitlar backend bilan bir xil. */
export type PostBlock =
  | 'HEADER'
  | 'PRICE'
  | 'STRENGTH'
  | 'PLAYERS'
  | 'COINS'
  | 'DESCRIPTION'
  | 'LINKS'
  | 'PLATFORM'
  | 'EXCHANGE'
  | 'DEVICE_LIMIT';

export const POST_BLOCK_LABELS: Record<PostBlock, string> = {
  HEADER: '🎮 Sarlavha',
  PRICE: '💰 Narx',
  STRENGTH: '🏆 Division · TS · o‘yinchi soni',
  PLAYERS: '⭐️ Qimmatli kartalar',
  COINS: '📱 Coinlar',
  DESCRIPTION: '📝 Sotuvchi tavsifi',
  LINKS: '🔗 Google Play / Game Center',
  PLATFORM: '📲 Platforma',
  EXCHANGE: '🔄 Obmen shartlari',
  DEVICE_LIMIT: '📵 Qurilma almashtirish limiti',
};

export interface PostSettings {
  enabled: PostBlock[];
  disabled: PostBlock[];
  footer: string | null;
  footerLimit: number;
}

export interface ChannelSummary {
  channelId: string;
  title: string;
  username: string | null;
  photoFileId: string | null;
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
  postSettings: PostSettings;
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


/**
 * Post ko'rinishini saqlaydi.
 *
 * <p>Bloklar ro'yxati TARTIB ham, yoqilganlik ham: ro'yxatda bor blok
 * chiqadi, yo'qi chiqmaydi.
 */
export async function updatePostSettings(
  blocks: PostBlock[],
  footer: string | null,
): Promise<PartnerPanel> {
  const response = await fetch(
    buildMarketplaceApiPath(['v1', 'partners', 'panel', 'post-settings']),
    {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ blocks, footer }),
    },
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message ?? 'Saqlanmadi');
  }
  return response.json();
}

/**
 * Saqlamasdan ko'rish.
 *
 * <p>Matnni BACKEND quradi — haqiqiy postni quradigan aynan o'sha kod
 * bilan. Bu yerda qayta yozsak, preview'dagi va kanaldagi post vaqt
 * o'tib bir-biridan farq qila boshlardi.
 */
export async function previewPost(
  blocks: PostBlock[],
  footer: string | null,
): Promise<string> {
  const response = await fetch(
    buildMarketplaceApiPath(['v1', 'partners', 'panel', 'post-preview']),
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ blocks, footer }),
    },
  );
  if (!response.ok) throw new Error('Ko‘rinishni yuklab bo‘lmadi');
  const payload = (await response.json()) as { html: string };
  return payload.html;
}

/** Bloklar ro'yxatida bitta elementni yuqoriga/pastga suradi. */
export function moveBlock(blocks: PostBlock[], index: number, delta: number): PostBlock[] {
  const target = index + delta;
  if (index < 0 || index >= blocks.length || target < 0 || target >= blocks.length) {
    return blocks;
  }
  const next = [...blocks];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
