import { describe, expect, it } from 'vitest';

import { planPollTick } from './trade-poll-plan';

/**
 * The stranded-seller regression (trade 6c09400e).
 *
 * The seller sends a proposal, so their client knows about it immediately and
 * used to stop polling right there. The buyer then accepts — on a different
 * browser — which opens the trade, provisions the escrow mailbox and moves to
 * WAITING_EMAIL_CHANGE within a second. The seller's panel never asked again,
 * so it kept rendering the pending-proposal card. The seller never saw the
 * mailbox address they were supposed to move the Konami account to, and the
 * trade timed out unattended 30 minutes later.
 *
 * The buyer's side hid the bug: accepting is their own action, so it refreshes
 * explicitly. Only the party who does not act goes stale.
 */
describe('planPollTick', () => {
  it('keeps watching for the trade while the proposal is pending', () => {
    // The regression: this used to stop.
    expect(planPollTick({ hasActiveTrade: false, hasProposal: true }))
      .toBe('watch-for-trade');
  });

  it('looks for a proposal when none is known', () => {
    expect(planPollTick({ hasActiveTrade: false, hasProposal: false }))
      .toBe('find-proposal');
  });

  it('stops once a trade exists', () => {
    // The trade-state poll owns it from here.
    expect(planPollTick({ hasActiveTrade: true, hasProposal: false }))
      .toBe('stop');
  });

  it('stops once a trade exists even with a proposal still in state', () => {
    // The proposer's `proposal` state is not cleared when the trade opens —
    // the trade must still win, or the panel flips back to the stale card.
    expect(planPollTick({ hasActiveTrade: true, hasProposal: true }))
      .toBe('stop');
  });
});
