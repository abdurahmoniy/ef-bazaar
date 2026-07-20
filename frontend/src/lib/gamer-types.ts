/** Mirrors marketplace-service GamerCardDtos / TrustDtos. */

export type GamerTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'ELITE' | 'LEGEND';

export type GamerPlatform = 'ANDROID' | 'IOS' | 'BOTH';

export interface GamerCardResponse {
  userId: string;
  displayName: string | null;
  telegramUsername: string | null;
  verified: boolean | null;
  memberSince: string | null;
  photoAvailable: boolean;
  elo: number;
  tier: GamerTier;
  wins: number;
  draws: number;
  losses: number;
  matchesCount: number;
  goalsFor: number;
  goalsAgainst: number;
  winRatePercent: number | null;
  tournaments: number;
  activeListings: number;
  soldListings: number;
  escrowPurchases: number;
  blacklisted: boolean;
  bio: string | null;
  platform: GamerPlatform | null;
  highestDivision: number | null;
  favoriteTeam: string | null;
}

export interface GamerProfileUpdateRequest {
  bio: string | null;
  platform: GamerPlatform | null;
  highestDivision: number | null;
  favoriteTeam: string | null;
}

export interface BlacklistEntry {
  userId: string;
  displayName: string | null;
  penaltyType: 'TEMP_BLOCK' | 'PERM_BLOCK';
  reason: string;
  confirmedComplaints: number;
  since: string;
  expiresAt: string | null;
  active: boolean;
}

/** Tier presentation: label + gradient used by the card and badges. */
export const TIER_META: Record<
  GamerTier,
  { label: string; gradient: string; text: string; ring: string }
> = {
  BRONZE: {
    label: 'Bronze',
    gradient: 'from-amber-700 via-amber-600 to-orange-800',
    text: 'text-amber-100',
    ring: 'ring-amber-600/40',
  },
  SILVER: {
    label: 'Silver',
    gradient: 'from-slate-400 via-slate-300 to-slate-500',
    text: 'text-slate-900',
    ring: 'ring-slate-400/40',
  },
  GOLD: {
    label: 'Gold',
    gradient: 'from-yellow-500 via-amber-400 to-yellow-600',
    text: 'text-yellow-950',
    ring: 'ring-yellow-500/40',
  },
  ELITE: {
    label: 'Elite',
    gradient: 'from-emerald-600 via-teal-500 to-cyan-600',
    text: 'text-emerald-50',
    ring: 'ring-emerald-500/40',
  },
  LEGEND: {
    label: 'Legend',
    gradient: 'from-purple-700 via-fuchsia-600 to-pink-600',
    text: 'text-purple-50',
    ring: 'ring-fuchsia-500/40',
  },
};
