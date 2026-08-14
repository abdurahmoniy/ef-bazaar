/**
 * Decides what the trade panel's poll tick should do.
 *
 * Split out of trade-panel.tsx so it can be tested without mounting the
 * component: the logic is three booleans, but getting it wrong strands a
 * party on a stale card with no way to notice the trade moved on.
 */

export type PollAction =
  /** A trade exists — the trade-state poll takes over, this one stops. */
  | 'stop'
  /** No proposal known yet; look for one the other party may have sent. */
  | 'find-proposal'
  /** A proposal is pending; watch for the accept that opens the trade. */
  | 'watch-for-trade';

export function planPollTick(state: {
  hasActiveTrade: boolean;
  hasProposal: boolean;
}): PollAction {
  if (state.hasActiveTrade) return 'stop';
  return state.hasProposal ? 'watch-for-trade' : 'find-proposal';
}
