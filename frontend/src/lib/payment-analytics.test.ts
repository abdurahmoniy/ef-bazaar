import { describe, expect, it } from 'vitest';

import {
  ledgerDrift,
  moneySplit,
  platformKindLabel,
  profitRows,
  referralPer100,
  shortfallTiyin,
  throughputByCardId,
} from './payment-analytics';
import type { PaymentAnalyticsOverview, TransactionKind } from './payment-types';

function overview(patch: Partial<PaymentAnalyticsOverview> = {}): PaymentAnalyticsOverview {
  return {
    ledgerCardsTiyin: 1_000_000,
    observedCardsTiyin: 1_000_000,
    unobservedCards: 0,
    userAvailableTiyin: 700_000,
    userHeldTiyin: 100_000,
    userWithdrawPendingTiyin: 100_000,
    usersTotalTiyin: 900_000,
    platformOwnTiyin: 100_000,
    revenueInTiyin: 150_000,
    revenueOutTiyin: 40_000,
    feesTiyin: 10_000,
    netTiyin: 100_000,
    referralRewardTiyin: 40_000,
    referralPayouts: 4,
    referralRecipients: 3,
    revenueByKind: [],
    cardThroughput: [],
    computedAt: '2026-09-10T12:00:00Z',
    ...patch,
  };
}

describe('moneySplit', () => {
  it('divides the cards between the users and the platform', () => {
    const [users, own] = moneySplit(overview());

    expect(users.tiyin).toBe(900_000);
    expect(own.tiyin).toBe(100_000);
    expect(users.percent).toBe(90);
    expect(own.percent).toBe(10);
  });

  it('draws nothing rather than a 50/50 bar over an empty ledger', () => {
    const slices = moneySplit(overview({
      ledgerCardsTiyin: 0,
      usersTotalTiyin: 0,
      userAvailableTiyin: 0,
      userHeldTiyin: 0,
      userWithdrawPendingTiyin: 0,
      platformOwnTiyin: 0,
    }));

    expect(slices.every((s) => s.percent === 0)).toBe(true);
  });

  /**
   * Referral rewards come out of equity, so the platform's share can go below
   * zero. A negative width is not a thing a bar can have — the slice reads
   * zero and the shortfall is reported on its own.
   */
  it('gives the platform no slice when it owes more than the cards hold', () => {
    const o = overview({ usersTotalTiyin: 900_000, platformOwnTiyin: -50_000 });
    const [users, own] = moneySplit(o);

    expect(own.tiyin).toBe(0);
    expect(own.percent).toBe(0);
    expect(users.percent).toBe(100);
  });
});

describe('shortfallTiyin', () => {
  it('is zero while the platform is in the black', () => {
    expect(shortfallTiyin(overview())).toBe(0);
  });

  it('reports what has to be covered from elsewhere', () => {
    expect(shortfallTiyin(overview({ platformOwnTiyin: -50_000 }))).toBe(50_000);
  });
});

describe('ledgerDrift', () => {
  it('confirms the cards hold what the books say', () => {
    expect(ledgerDrift(overview())).toEqual({ kind: 'match' });
  });

  it('reports the difference when they disagree', () => {
    const verdict = ledgerDrift(overview({ observedCardsTiyin: 990_000 }));

    expect(verdict).toEqual({ kind: 'drift', tiyin: -10_000 });
  });

  /**
   * A card that never reported leaves the observed total short by an unknown
   * amount. Subtracting anyway would invent a drift and send an admin looking
   * for money that is not missing.
   */
  it('refuses to compare while a card has never reported', () => {
    const verdict = ledgerDrift(overview({
      observedCardsTiyin: 400_000,
      unobservedCards: 2,
    }));

    expect(verdict).toEqual({ kind: 'unknown', unobservedCards: 2 });
  });
});

describe('profitRows', () => {
  it('splits a kind that moved equity in both directions into two rows', () => {
    const rows = profitRows([
      { kind: 'ADJUSTMENT', inTiyin: 5_000, outTiyin: 2_000 },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ direction: 'in', tiyin: 5_000, percent: 100 });
    expect(rows[1]).toMatchObject({ direction: 'out', tiyin: 2_000, percent: 40 });
  });

  it('orders by size and scales bars to the biggest row', () => {
    const rows = profitRows([
      { kind: 'REFERRAL_REWARD', inTiyin: 0, outTiyin: 30_000 },
      { kind: 'TRADE_SETTLE', inTiyin: 120_000, outTiyin: 0 },
    ]);

    expect(rows.map((r) => r.kind)).toEqual(['TRADE_SETTLE', 'REFERRAL_REWARD']);
    expect(rows[0].percent).toBe(100);
    expect(rows[1].percent).toBe(25);
  });

  it('drops the empty direction rather than drawing a zero bar', () => {
    const rows = profitRows([{ kind: 'TRADE_SETTLE', inTiyin: 10_000, outTiyin: 0 }]);

    expect(rows).toHaveLength(1);
    expect(rows[0].direction).toBe('in');
  });

  it('has nothing to draw for an empty ledger', () => {
    expect(profitRows([])).toEqual([]);
  });

  /** A kind added to payment-service later must still appear, named or not. */
  it('names a kind this build has never heard of', () => {
    const rows = profitRows([
      { kind: 'FUTURE_KIND' as TransactionKind, inTiyin: 1_000, outTiyin: 0 },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('Boshqa amaliyot');
  });
});

describe('platformKindLabel', () => {
  /**
   * The same transaction is a bonus to the referrer and a cost to the platform.
   * This screen is the platform's.
   */
  it('names a referral reward as spending, not as a bonus', () => {
    expect(platformKindLabel('REFERRAL_REWARD')).toBe('Referal mukofoti');
  });

  it('names plan sales as revenue', () => {
    expect(platformKindLabel('PLAN_PURCHASE')).toBe('Tarif sotuvi');
  });
});

describe('referralPer100', () => {
  it('answers what share of the earnings went back out', () => {
    expect(referralPer100(overview())).toBe(27);
  });

  it('has no answer before anything has been earned', () => {
    expect(referralPer100(overview({ revenueInTiyin: 0 }))).toBeNull();
  });
});

describe('throughputByCardId', () => {
  it('keys the volume by card so the list can join on it', () => {
    const map = throughputByCardId(overview({
      cardThroughput: [{ cardId: 'card-1', throughputTiyin: 5_000, paidInvoices: 2 }],
    }));

    expect(map.get('card-1')).toEqual({ throughputTiyin: 5_000, paidInvoices: 2 });
    expect(map.get('card-2')).toBeUndefined();
  });
});
