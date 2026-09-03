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
   *
   * BEFORE TURNING THIS BACK ON, read this. A HUMAN trade never touches the
   * wallet, so it takes no commission — `TradeStateHandler.settleEscrow`
   * returns early for anything that is not SMART. The referral reward, though,
   * pays out on any successful trade. Two accounts belonging to one person,
   * one referring the other, can close a HUMAN trade that costs them nothing
   * and collect the reward out of PLATFORM_REVENUE, once per fake account.
   *
   * Today that is closed only because this flag is false. SMART trades carry a
   * commission floor (5 000 so'm below the 100 000 band) that matches the
   * default reward, so the platform breaks even on those. Re-enabling HUMAN
   * mode reopens it, and nothing in the referral code will notice.
   *
   * The narrowest fix, if it is ever wanted: decline the reward when the other
   * side of the qualifying trade is the referrer. It gates nothing on
   * profitability and needs no new setting.
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
  dreamTeam: false,
  /** Community gamer profiles & directory. */
  gamers: false,
} as const;

export type FeatureKey = keyof typeof FEATURES;

/** Check if a feature is enabled. */
export function isFeatureEnabled(key: FeatureKey): boolean {
  return FEATURES[key];
}
