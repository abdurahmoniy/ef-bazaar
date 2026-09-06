import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';

export interface InvitedUser {
  userId: string;
  displayName: string | null;
  joinedAt: string;
  rewardedAt: string | null;
  rewardSom: number | null;
}

export interface MyReferrals {
  code: string;
  invitedCount: number;
  rewardedCount: number;
  earnedSom: number;
  rewardSom: number;
  invited: InvitedUser[];
}

export async function getMyReferrals(): Promise<MyReferrals> {
  const response = await fetch(buildMarketplaceApiPath(['v1', 'referrals', 'me']), {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Referal maʼlumotlari yuklanmadi');
  return response.json();
}

/**
 * Ro'yxatdan o'tgandan keyin cookie'dagi kodni yuboradi.
 *
 * Rad etish xato EMAS: kod eskirgan yoki foydalanuvchi allaqachon
 * taklif qilingan bo'lishi mutlaqo normal va ekranda ko'rsatiladigan
 * hodisa emas.
 */
export async function claimReferral(code: string): Promise<boolean> {
  const response = await fetch(buildMarketplaceApiPath(['v1', 'referrals', 'claim']), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ code }),
  });
  // The API represents definitive business rejection as 200 { claimed: false }.
  // HTTP errors (including expired auth) must leave the cookie available to retry.
  if (!response.ok) throw new Error('Taklifni tasdiqlab boʼlmadi');
  const body = await response.json();
  if (typeof body?.claimed !== 'boolean') throw new Error('Taklif javobi tushunarsiz');
  return body.claimed;
}
