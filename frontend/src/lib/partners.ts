import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';

export type PartnerApplicationStatus =
  | 'AWAITING_CHANNEL'
  | 'AWAITING_PAYMENT'
  | 'AWAITING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export interface PartnerSettings {
  minSubscribers: number;
  /** PERCENT yoki FIXED — barcha hamkorlarga standart. */
  defaultPayoutMode: 'PERCENT' | 'FIXED';
  /** Asos punktida: 1000 = 10%. */
  defaultTradePercentBp: number;
  defaultFixedMonthlySom: number;
  /**
   * Referal mukofoti — HAMMA foydalanuvchi uchun, hamkorlarga xos emas.
   * Bu yerdan ham tahrirlanadi, lekin qiymat /admin/referrals dagi
   * bilan BITTA: ikkinchi nusxa bo'lsa ikki ekran bir-biriga zid
   * raqam ko'rsatardi.
   */
  referralRewardSom: number;
  priceSom: number;
  updatedAt: string;
}

export interface PartnerApplication {
  id: string;
  userId: string;
  status: PartnerApplicationStatus;
  channelId: number | null;
  channelTitle: string | null;
  channelUsername: string | null;
  subscriberCount: number | null;
  verifiedAt: string | null;
  verificationError: string | null;
  invoiceId: string | null;
  paidAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

/** Admin panelidagi ishoralar: bo'lim kaliti → ko'rilmagan elementlar soni. */
export type AdminBadges = Record<string, number>;

export const BADGE_PARTNER_APPLICATIONS = 'partner-applications';
export const BADGE_WITHDRAWALS = 'withdrawals';

async function parseError(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    return payload?.message || payload?.error || `Xatolik (${response.status})`;
  } catch {
    return `Xatolik (${response.status})`;
  }
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

// ---------- foydalanuvchi tomoni ----------

export async function getPartnerSettings(): Promise<PartnerSettings> {
  return json(
    await fetch(buildMarketplaceApiPath(['v1', 'partners', 'settings']), {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    }),
  );
}

/** Ariza yo'q bo'lsa backend `null` qaytaradi — bu xato emas, oddiy holat. */
export async function getMyApplication(): Promise<PartnerApplication | null> {
  const response = await fetch(buildMarketplaceApiPath(['v1', 'partners', 'me']), {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) throw new Error(await parseError(response));
  const text = await response.text();
  return text ? (JSON.parse(text) as PartnerApplication) : null;
}

export async function applyForPartnership(): Promise<PartnerApplication> {
  return json(
    await fetch(buildMarketplaceApiPath(['v1', 'partners', 'apply']), {
      method: 'POST',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    }),
  );
}

/**
 * Arizani yoki faol hamkorlikni bekor qiladi.
 *
 * <p>To'lov qaytarilmaydi — chaqiruvchi buni foydalanuvchiga oldindan
 * aytishi kerak.
 */
export async function cancelPartnership(): Promise<PartnerApplication> {
  return json(
    await fetch(buildMarketplaceApiPath(['v1', 'partners', 'cancel']), {
      method: 'POST',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    }),
  );
}

export async function payPartnershipFee(): Promise<PartnerApplication> {
  return json(
    await fetch(buildMarketplaceApiPath(['v1', 'partners', 'pay']), {
      method: 'POST',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    }),
  );
}

// ---------- admin tomoni ----------

export async function getAdminPartnerSettings(): Promise<PartnerSettings> {
  return json(
    await fetch(buildMarketplaceApiPath(['v1', 'admin', 'partners', 'settings']), {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    }),
  );
}

/** Sozlash tabidagi bitta kanal qatori. */
export interface ChannelPayoutRow {
  channelId: string;
  title: string;
  partnerUserId: string;
  active: boolean;
  /** Kanalning O'Z qiymatlari — null bo'lsa globalga ergashadi. */
  payoutMode: 'PERCENT' | 'FIXED' | null;
  tradePercentBp: number | null;
  fixedMonthlySom: number | null;
  /** Amalda qo'llanadigan qiymatlar. */
  effectivePayoutMode: 'PERCENT' | 'FIXED';
  effectiveTradePercentBp: number;
  effectiveFixedMonthlySom: number;
  /** Hamkorning o'zi qo'ygan post narxi — admin o'zgartirmaydi. */
  postPriceSom: number;
}

/** Asos punkti ↔ foiz. 1000 bp = 10%. */
export function bpToPercent(bp: number): number {
  return bp / 100;
}

export function percentToBp(percent: number): number {
  return Math.round(percent * 100);
}

export async function getChannelPayouts(): Promise<ChannelPayoutRow[]> {
  return json(
    await fetch(buildMarketplaceApiPath(['v1', 'admin', 'partners', 'channels']), {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    }),
  );
}

export async function updateChannelPayout(
  channelId: string,
  input: {
    payoutMode: 'PERCENT' | 'FIXED' | null;
    tradePercentBp: number | null;
    fixedMonthlySom: number | null;
  },
): Promise<ChannelPayoutRow[]> {
  return json(
    await fetch(
      buildMarketplaceApiPath(['v1', 'admin', 'partners', 'channels', channelId, 'payout']),
      {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(input),
      },
    ),
  );
}

export async function updateAdminPartnerSettings(input: {
  minSubscribers: number;
  priceSom: number;
  defaultPayoutMode: 'PERCENT' | 'FIXED';
  defaultTradePercentBp: number;
  defaultFixedMonthlySom: number;
  referralRewardSom: number;
}): Promise<PartnerSettings> {
  return json(
    await fetch(buildMarketplaceApiPath(['v1', 'admin', 'partners', 'settings']), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
    }),
  );
}

export async function getAdminApplications(
  status?: PartnerApplicationStatus,
): Promise<{ content: PartnerApplication[] }> {
  const params = new URLSearchParams({ page: '0', size: '50' });
  if (status) params.set('status', status);
  return json(
    await fetch(buildMarketplaceApiPath(['v1', 'admin', 'partners', 'applications'], params), {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    }),
  );
}

export async function reviewApplication(
  id: string,
  outcome: 'approve' | 'reject' | 'cancel',
  note?: string,
): Promise<PartnerApplication> {
  return json(
    await fetch(
      buildMarketplaceApiPath(['v1', 'admin', 'partners', 'applications', id, outcome]),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ note: note ?? null }),
      },
    ),
  );
}

// ---------- ishoralar ----------

export async function getAdminBadges(): Promise<AdminBadges> {
  return json(
    await fetch(buildMarketplaceApiPath(['v1', 'admin', 'badges']), {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    }),
  );
}

/**
 * Bo'lim ko'rildi — ishora o'chadi.
 *
 * <p>Nosozlik yutiladi: ishora keyingi so'rovda baribir yangilanadi va
 * "ko'rildi" yozib bo'lmagani foydalanuvchiga ko'rsatiladigan xato emas.
 */
export async function markSectionSeen(section: string): Promise<void> {
  try {
    await fetch(buildMarketplaceApiPath(['v1', 'admin', 'badges', section, 'seen']), {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // ko'rsatiladigan xato emas
  }
}
