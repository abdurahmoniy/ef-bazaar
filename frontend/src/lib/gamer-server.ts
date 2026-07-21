import { apiFetch, ApiException } from '@/lib/api';
import type { BlacklistEntry, GamerCardResponse } from '@/lib/gamer-types';
import type { PageResponse } from '@/lib/marketplace-types';

/** Server-side Gamer Card / blacklist reads (RSC pages). All fail-soft. */

export async function getGamerCard(userId: string): Promise<GamerCardResponse | null> {
  try {
    return await apiFetch<GamerCardResponse>(`/marketplace/v1/gamer-cards/${userId}`, {
      auth: false,
    });
  } catch (error) {
    if (error instanceof ApiException && error.status === 404) return null;
    console.error('[gamer-server] getGamerCard failed:', error);
    return null;
  }
}

export async function getBlacklistPage(page = 0, size = 20): Promise<PageResponse<BlacklistEntry> | null> {
  try {
    return await apiFetch<PageResponse<BlacklistEntry>>(
      `/marketplace/v1/blacklist?page=${page}&size=${size}`,
      { auth: false },
    );
  } catch (error) {
    console.error('[gamer-server] getBlacklistPage failed:', error);
    return null;
  }
}

export async function isUserBlacklisted(userId: string): Promise<boolean> {
  try {
    const res = await apiFetch<{ blacklisted: boolean }>(
      `/marketplace/v1/blacklist/check?userId=${userId}`,
      { auth: false },
    );
    return res.blacklisted === true;
  } catch {
    return false;
  }
}
