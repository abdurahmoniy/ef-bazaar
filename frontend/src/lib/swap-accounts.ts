import type { UserAccountResponse } from '@/lib/accounts-types';
import { listingMediaUrl } from '@/lib/marketplace-media';
import type { GiveAccountSnapshot, TradeResponse } from '@/lib/trade-types';

export type SwapSide = { title: string; coverUrl: string | null; teamStrength: number | null; external: boolean };

const EXTERNAL: SwapSide = { title: 'Platformadan tashqari akkount', coverUrl: null, teamStrength: null, external: true };

function firstLine(text: string | null | undefined) {
  return text?.split('\n')[0]?.trim() ?? '';
}

function positiveNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function accountTitle(account: Pick<UserAccountResponse, 'title' | 'description'>): string {
  return account.title?.trim() || firstLine(account.description) || 'Nomsiz akkount';
}

export function givenSide(snapshot: GiveAccountSnapshot | null | undefined): SwapSide {
  if (!snapshot) return EXTERNAL;
  return {
    title: snapshot.title?.trim() || firstLine(snapshot.summary) || 'Nomsiz akkount',
    coverUrl: snapshot.coverMessageId ? listingMediaUrl(snapshot.coverMessageId) : null,
    teamStrength: positiveNumber(snapshot.teamStrength),
    external: false,
  };
}

export function listingSide(listing: {
  description: string;
  mediaMessageIds?: string[];
  coverMessageId?: string | null;
  attributes?: Record<string, unknown>;
} | null): SwapSide | null {
  if (!listing) return null;
  const cover = listing.coverMessageId ?? listing.mediaMessageIds?.[0] ?? null;
  return {
    title: firstLine(listing.description) || 'E’lon',
    coverUrl: cover ? listingMediaUrl(cover) : null,
    teamStrength: positiveNumber(listing.attributes?.team_strength),
    external: false,
  };
}

export function receivedSide(
  trade: Pick<TradeResponse, 'sellerId' | 'buyerId' | 'giveAccount'>,
  viewerId: string,
  listing: SwapSide | null,
): SwapSide | null {
  if (trade.sellerId === viewerId) return givenSide(trade.giveAccount);
  if (trade.buyerId === viewerId) return listing;
  return null;
}

export async function fetchBusyAccountIds(): Promise<Set<string>> {
  try {
    const response = await fetch('/api/trade/v1/trades/busy-accounts', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return new Set();
    return new Set((await response.json()) as string[]);
  } catch {
    return new Set();
  }
}
