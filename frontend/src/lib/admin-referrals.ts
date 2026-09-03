import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';

import type { InvitedUser } from '@/lib/referrals';

export interface ReferrerRow {
  userId: string;
  displayName: string | null;
  telegramUsername: string | null;
  invitedCount: number;
  rewardedCount: number;
  earnedSom: number;
}

export interface ReferralSettings {
  rewardSom: number;
  updatedAt: string;
}

/**
 * Reyting: ko'p olib kelgan yuqorida.
 *
 * <p>Tenglashsa haqiqatan to'langani hal qiladi — beshta nom keltirib
 * bittasi savdo qilgan odam, beshta nom keltirib uchtasi savdo qilgan
 * odamdan pastroq turadi.
 *
 * <p>Server ham shu tartibda qaytaradi. Bu yerda qayta tartiblanadi,
 * chunki bosh panel ham shu funksiyani ishlatadi va ikki joyda ikki xil
 * tartib bo'lsa ular kim birinchi ekanida bir-biriga zid gapirardi.
 */
export function sortByInvited<T extends { invitedCount: number; earnedSom: number }>(
  rows: T[],
): T[] {
  return [...rows].sort(
    (a, b) => b.invitedCount - a.invitedCount || b.earnedSom - a.earnedSom,
  );
}

/** Hech narsa ishlamagan bo'lsa nol emas, chiziqcha — jadval tinchroq o'qiladi. */
export function formatEarned(som: number): string {
  if (!som) return '—';
  return som.toLocaleString('uz-UZ');
}

/** Ismi yo'q foydalanuvchini ham ko'rsatish kerak — sanoq ismga bog'liq emas. */
export function referrerLabel(row: ReferrerRow): string {
  if (row.displayName) return row.displayName;
  if (row.telegramUsername) return `@${row.telegramUsername}`;
  return row.userId.slice(0, 8);
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`Xatolik (${response.status})`);
  return response.json();
}

export async function getReferrerLeaderboard(): Promise<ReferrerRow[]> {
  return json(
    await fetch(buildMarketplaceApiPath(['v1', 'admin', 'referrals']), {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    }),
  );
}

export async function getInvitedBy(userId: string): Promise<InvitedUser[]> {
  return json(
    await fetch(buildMarketplaceApiPath(['v1', 'admin', 'referrals', userId]), {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    }),
  );
}

export async function getReferralSettings(): Promise<ReferralSettings> {
  return json(
    await fetch(buildMarketplaceApiPath(['v1', 'admin', 'referrals', 'settings']), {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    }),
  );
}

export async function updateReferralSettings(rewardSom: number): Promise<ReferralSettings> {
  return json(
    await fetch(buildMarketplaceApiPath(['v1', 'admin', 'referrals', 'settings']), {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ rewardSom }),
    }),
  );
}
