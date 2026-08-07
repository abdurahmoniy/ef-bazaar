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

export type TrustComplaintStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED';

export type TrustComplaintCategory = 'LAG_BREAK' | 'FRAUD' | 'TOXIC' | 'FAKE_RESULT';

export type TrustContextType = 'MATCH' | 'TRADE' | 'CHAT';

/** Mirrors TrustDtos.ComplaintResponse — admin review surface. */
export interface TrustComplaint {
  id: string;
  complainantId: string;
  accusedId: string;
  contextType: TrustContextType;
  contextId: string;
  category: TrustComplaintCategory;
  details: string | null;
  evidenceMessageIds: string[] | null;
  status: TrustComplaintStatus;
  createdAt: string;
  reviewedAt: string | null;
}

export const TRUST_CATEGORY_LABELS: Record<TrustComplaintCategory, string> = {
  LAG_BREAK: 'Lag-break',
  FRAUD: 'Firibgarlik',
  TOXIC: 'Toksik xatti-harakat',
  FAKE_RESULT: "Yolg'on natija",
};

export const TRUST_CONTEXT_LABELS: Record<TrustContextType, string> = {
  MATCH: 'Match',
  TRADE: 'Savdo',
  CHAT: 'Chat',
};

/** Ladder order — mirrors GamerCardDtos.Tier.fromElo thresholds. */
export const TIER_ORDER: GamerTier[] = ['BRONZE', 'SILVER', 'GOLD', 'ELITE', 'LEGEND'];

/** ELO ceiling used to fill the LEGEND segment (the tier itself is open-ended). */
const LEGEND_SOFT_CEILING = 2000;

export interface TierMeta {
  /** Uzbek name stamped on the crest. */
  label: string;
  /** 3-letter tick under the ladder. */
  short: string;
  /** Inclusive ELO floor. */
  min: number;
  /** Inclusive ELO ceiling; null for the open-ended top tier. */
  max: number | null;
  /** Metal palette: mid, dark, highlight. Plain hex — html2canvas-safe. */
  m1: string;
  m2: string;
  m3: string;
}

/** Tier presentation: name + metal palette used by the card crest and ladder. */
export const TIER_META: Record<GamerTier, TierMeta> = {
  BRONZE: {
    label: 'Bronza',
    short: 'BRO',
    min: 0,
    max: 999,
    m1: '#E0965A',
    m2: '#7A431C',
    m3: '#FFD6AC',
  },
  SILVER: {
    label: 'Kumush',
    short: 'KUM',
    min: 1000,
    max: 1199,
    m1: '#D8DEE9',
    m2: '#7C8697',
    m3: '#FFFFFF',
  },
  GOLD: {
    label: 'Oltin',
    short: 'OLT',
    min: 1200,
    max: 1399,
    m1: '#F2C455',
    m2: '#8A6111',
    m3: '#FFF0B8',
  },
  ELITE: {
    label: 'Elita',
    short: 'ELI',
    min: 1400,
    max: 1599,
    m1: '#8FD4FF',
    m2: '#255C93',
    m3: '#E8F7FF',
  },
  LEGEND: {
    label: 'Afsona',
    short: 'AFS',
    min: 1600,
    max: null,
    m1: '#FF8AE0',
    m2: '#6D2BFF',
    m3: '#FFE9FA',
  },
};

export interface TierProgress {
  index: number;
  /** Fill of the current tier's ladder segment, 0–100. */
  percent: number;
  /** null once the player is in the top tier. */
  nextTier: TierMeta | null;
  /** ELO still needed for the next tier; null in the top tier. */
  eloToNext: number | null;
}

/**
 * Honest progress: position *inside* the current tier only, so the bar never
 * implies the player is closer to promotion than they are.
 */
export function tierProgress(tier: GamerTier, elo: number): TierProgress {
  const index = TIER_ORDER.indexOf(tier);
  const meta = TIER_META[tier];
  const ceiling = meta.max ?? LEGEND_SOFT_CEILING;
  const span = ceiling - meta.min + 1;
  const percent = Math.max(0, Math.min(100, ((elo - meta.min) / span) * 100));
  const next = index >= 0 && index < TIER_ORDER.length - 1 ? TIER_META[TIER_ORDER[index + 1]] : null;

  return {
    index,
    percent,
    nextTier: next,
    eloToNext: next ? Math.max(0, next.min - elo) : null,
  };
}
