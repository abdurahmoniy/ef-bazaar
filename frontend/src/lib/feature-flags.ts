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
  /**
   * Human trade admin: the workspace, the public directory, the applications,
   * the admin oversight screens, the role toggle, and the HUMAN option when a
   * trade is proposed.
   *
   * Off means closed for use, not deleted. Every route, component and API call
   * stays exactly where it is — this flag only removes the ways in. Turning it
   * back on is one line.
   *
   * SMART trades are untouched. They are a different mode of the same trade
   * service and nothing here gates them.
   *
   * Replaces `tradeAdmin` and `tradeAdminDirectory`, which were declared but
   * referenced nowhere — they read as protection while gating nothing.
   */
  humanAdmin: false,
  /** Public scammer blacklist (/blacklist). */
  blacklist: true,
  /**
   * Wallet & card top-up (/hamyon).
   *
   * Shipped dark until the rail was proven end to end on 2026-08-14: the
   * userbot holds a live session, a platform card is active, and a real
   * transfer was observed and queued. Three bugs had to be found first, and
   * every one of them was silent — which is exactly why this stayed off.
   */
  wallet: true,

  // ── Phase 3 ───────────────────────────────────────────────────
  /** Tournament brackets & registration. */
  tournaments: false,
  /** Dream team builder. */
  dreamTeam: true,
  /** Community gamer profiles & directory. */
  gamers: false,
} as const;

export type FeatureKey = keyof typeof FEATURES;

/** Check if a feature is enabled. */
export function isFeatureEnabled(key: FeatureKey): boolean {
  return FEATURES[key];
}
