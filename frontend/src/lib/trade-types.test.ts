import { describe, expect, it } from 'vitest';

import { splitTrades } from './trade-types';
import type { TradeResponse, TradeState } from './trade-types';

const trade = (id: string, state: TradeState): TradeResponse =>
  ({ id, state } as unknown as TradeResponse);

/**
 * Which trade the panel is meant to be showing.
 *
 * Reported from testing: a trade ran out of time, and the pair wanted to start
 * another one for the same account. They could not — the panel kept showing the
 * dead trade, because it took whichever trade was newest and never asked
 * whether it had finished. The chat looked used up.
 */
describe('splitTrades', () => {
  it('has nothing to show for a chat that has never traded', () => {
    expect(splitTrades(null)).toEqual({ active: null, lastFinished: null });
    expect(splitTrades([])).toEqual({ active: null, lastFinished: null });
  });

  it('shows the trade that is still running', () => {
    const live = trade('t1', 'WAITING_EMAIL_CHANGE');

    expect(splitTrades([live]).active).toBe(live);
    expect(splitTrades([live]).lastFinished).toBeNull();
  });

  it('treats a trade that ran out of time as over', () => {
    const dead = trade('t1', 'ORPHANED');

    const { active, lastFinished } = splitTrades([dead]);

    expect(active).toBeNull();
    // Not discarded: the pair should still be told how it ended.
    expect(lastFinished).toBe(dead);
  });

  it('counts a rejected and a completed trade as over too', () => {
    expect(splitTrades([trade('t1', 'REJECTED')]).active).toBeNull();
    expect(splitTrades([trade('t1', 'SUCCESS')]).active).toBeNull();
  });

  it('finds the running trade underneath a newer finished one', () => {
    // Newest first, as the API returns them. A pair can start again after one
    // trade dies, so the list holds both.
    const finished = trade('new', 'ORPHANED');
    const live = trade('old', 'WAITING_PASSWORD');

    const { active, lastFinished } = splitTrades([finished, live]);

    expect(active).toBe(live);
    expect(lastFinished)
      .toBeNull();
  });

  it('reports the newest ending when every trade is over', () => {
    const newest = trade('new', 'ORPHANED');
    const older = trade('old', 'SUCCESS');

    expect(splitTrades([newest, older]).lastFinished).toBe(newest);
  });
});
