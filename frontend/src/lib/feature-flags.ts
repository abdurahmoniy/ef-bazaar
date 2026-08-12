/**
 * Feature flags for progressive feature release.
 *
 * Phase 1 (launch): Core marketplace loop — browse, chat, sell, profile.
 * Phase 2 (+2-4 weeks): Trust & safety — trade admin, blacklist.
 * Phase 3 (+1-2 months): Community — dream team, tournaments, gamers.
 *
 * Flip a flag to `true` when the feature is ready for all users.
 */
export const FEATURES = {
  /** Marketplace browse, create, edit, detail pages. Always on. */
  marketplace: true,
  /** Buyer ↔ seller chat. Always on. */
  chat: true,
  /** User profile & auth. Always on. */
  profile: true,
  /** Liked/saved listings tab. Always on. */
  favorites: true,

  // ── Phase 2 ───────────────────────────────────────────────────
  /** Human trade admin escrow system. */
  tradeAdmin: true,
  /** Public scammer blacklist (/blacklist). */
  blacklist: true,
  /** Trade admin public directory (/trade-admins). */
  tradeAdminDirectory: true,

  // ── Phase 3 ───────────────────────────────────────────────────
  /** Tournament brackets & registration. */
  tournaments: false,
  /** Dream team builder. */
  dreamTeam: false,
  /** Community gamer profiles & directory. */
  gamers: false,
} as const;

export type FeatureKey = keyof typeof FEATURES;

/** Check if a feature is enabled. */
export function isFeatureEnabled(key: FeatureKey): boolean {
  return FEATURES[key];
}
