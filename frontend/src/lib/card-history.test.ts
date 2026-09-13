import { describe, expect, it } from 'vitest';

import {
  cardsInHistory,
  creditStatusLabel,
  dayBarWidths,
  dayLabel,
  groupByDay,
  movementBadge,
  movementDetail,
  movementTotals,
} from './card-history';
import type { CardMovement } from './payment-types';

function movement(patch: Partial<CardMovement> = {}): CardMovement {
  return {
    id: crypto.randomUUID(),
    direction: 'IN',
    cardLast4: '0101',
    amountTiyin: 100_000,
    observedAt: '2026-09-10T12:00:00Z',
    ...patch,
  };
}

describe('movementDetail', () => {
  it("gives a debit the bank's own words", () => {
    const detail = movementDetail(movement({
      direction: 'OUT',
      description: 'Openbank P2P HUMO OT',
    }));

    expect(detail).toBe('Openbank P2P HUMO OT');
  });

  it('gives a credit its reconciliation status', () => {
    expect(movementDetail(movement({ creditStatus: 'UNMATCHED' })))
      .toBe('Tekshirilmagan');
  });

  /** The bank omits the description on some notices. */
  it('has nothing to say rather than an empty line', () => {
    expect(movementDetail(movement({ direction: 'OUT' }))).toBeNull();
    expect(movementDetail(movement({ direction: 'OUT', description: '   ' }))).toBeNull();
    expect(movementDetail(movement({ direction: 'IN' }))).toBeNull();
  });
});

describe('creditStatusLabel', () => {
  it('names the statuses this build knows', () => {
    expect(creditStatusLabel('MATCHED')).toBe("So'rovga biriktirildi");
  });

  /** payment-service may grow a status this build predates. */
  it('falls back to the raw value rather than a blank cell', () => {
    expect(creditStatusLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
  });
});

describe('cardsInHistory', () => {
  it('lists each card once, in the order first seen', () => {
    const cards = cardsInHistory([
      movement({ cardLast4: '0202' }),
      movement({ cardLast4: '0101' }),
      movement({ cardLast4: '0202' }),
    ]);

    expect(cards).toEqual(['0202', '0101']);
  });

  /**
   * The filter is built from the history, not from today's card list: a
   * deleted card — or one the platform never owned — still has rows, and those
   * are exactly the rows an admin looks for when something is wrong.
   */
  it('includes a card that is no longer in the card list', () => {
    expect(cardsInHistory([movement({ cardLast4: '9999' })])).toEqual(['9999']);
  });

  it('has no filter to offer for an empty history', () => {
    expect(cardsInHistory([])).toEqual([]);
  });
});

describe('movementTotals', () => {
  it('adds each direction up and reports the difference', () => {
    const totals = movementTotals([
      movement({ direction: 'IN', amountTiyin: 300_000 }),
      movement({ direction: 'OUT', amountTiyin: 100_000 }),
      movement({ direction: 'IN', amountTiyin: 50_000 }),
    ]);

    expect(totals).toEqual({ inTiyin: 350_000, outTiyin: 100_000, netTiyin: 250_000 });
  });

  it('goes negative when more left than arrived', () => {
    const totals = movementTotals([
      movement({ direction: 'OUT', amountTiyin: 100_000 }),
    ]);

    expect(totals.netTiyin).toBe(-100_000);
  });

  it('is all zeros for an empty page', () => {
    expect(movementTotals([])).toEqual({ inTiyin: 0, outTiyin: 0, netTiyin: 0 });
  });
});

describe('movementBadge', () => {
  it('flags a credit nobody has accounted for', () => {
    expect(movementBadge(movement({ creditStatus: 'UNMATCHED' })))
      .toBe('Tekshirilmagan');
  });

  /** A badge on every row is a badge on none — the list is scanned, not read. */
  it('leaves an ordinary movement unmarked', () => {
    expect(movementBadge(movement({ creditStatus: 'MATCHED' }))).toBeNull();
    expect(movementBadge(movement({ direction: 'OUT' }))).toBeNull();
  });

});

describe('groupByDay', () => {
  const NOW = new Date('2026-09-11T06:00:00Z');

  it('groups by Tashkent date, newest day first, with per-day totals', () => {
    const days = groupByDay([
      movement({ direction: 'OUT', amountTiyin: 1_000_000, observedAt: '2026-09-10T20:34:00Z' }),
      movement({ direction: 'IN', amountTiyin: 700_000, observedAt: '2026-09-10T19:58:00Z' }),
      movement({ direction: 'IN', amountTiyin: 500_000, observedAt: '2026-09-09T10:00:00Z' }),
    ], NOW);

    // The first two are 01:34 and 00:58 Tashkent on the 11th, despite their
    // UTC stamps reading the 10th. The third is plainly the 9th.
    expect(days.map((d) => d.key)).toEqual(['2026-09-11', '2026-09-09']);
    expect(days[0]).toMatchObject({ inTiyin: 700_000, outTiyin: 1_000_000 });
    expect(days[1]).toMatchObject({ inTiyin: 500_000, outTiyin: 0 });
  });

  /**
   * The case this exists for. 20:34 UTC is 01:34 the next day in Tashkent, and
   * the bank's own notice prints that local time — filing it under the UTC day
   * would put it where an admin reconciling against the notice cannot find it.
   */
  it('files a late-evening UTC movement under the local day it happened', () => {
    const days = groupByDay([
      movement({ observedAt: '2026-09-10T20:34:00Z' }),
    ], NOW);

    expect(days[0].key).toBe('2026-09-11');
    expect(days[0].label).toBe('Bugun');
  });

  it('preserves the order the backend returned inside a day', () => {
    const days = groupByDay([
      movement({ amountTiyin: 300, observedAt: '2026-09-11T05:00:00Z' }),
      movement({ amountTiyin: 200, observedAt: '2026-09-11T04:00:00Z' }),
      movement({ amountTiyin: 100, observedAt: '2026-09-11T03:00:00Z' }),
    ], NOW);

    expect(days[0].movements.map((m) => m.amountTiyin)).toEqual([300, 200, 100]);
  });

  it('has no days for an empty history', () => {
    expect(groupByDay([], NOW)).toEqual([]);
  });
});

describe('dayLabel', () => {
  const NOW = new Date('2026-09-11T06:00:00Z');

  it('names today and yesterday relatively and the rest by date', () => {
    expect(dayLabel('2026-09-11', NOW)).toBe('Bugun');
    expect(dayLabel('2026-09-10', NOW)).toBe('Kecha');
    expect(dayLabel('2026-09-08', NOW)).toBe('8 sentabr');
  });

  /**
   * `now` is passed in rather than read from the clock: a server render and a
   * client hydration across midnight would otherwise disagree about what today
   * is, and React fails on the mismatch.
   */
  it('answers from the given clock, not the machine one', () => {
    expect(dayLabel('2026-09-11', new Date('2026-09-20T06:00:00Z'))).toBe('11 sentabr');
  });
});

describe('dayBarWidths', () => {
  const NOW = new Date('2026-09-11T06:00:00Z');

  /**
   * One scale across the page. Bars that each filled their own row would make
   * a 40 000 so'm day and a 4 000 000 so'm day look identical.
   */
  it('scales every day against the busiest one on screen', () => {
    const days = groupByDay([
      movement({ direction: 'IN', amountTiyin: 800_000, observedAt: '2026-09-11T05:00:00Z' }),
      movement({ direction: 'OUT', amountTiyin: 200_000, observedAt: '2026-09-11T04:00:00Z' }),
      movement({ direction: 'IN', amountTiyin: 250_000, observedAt: '2026-09-10T05:00:00Z' }),
    ], NOW);

    expect(dayBarWidths(days[0], days)).toEqual({ inPercent: 80, outPercent: 20 });
    expect(dayBarWidths(days[1], days)).toEqual({ inPercent: 25, outPercent: 0 });
  });

  it('draws nothing rather than dividing by zero', () => {
    expect(dayBarWidths(
      { key: 'x', label: 'x', inTiyin: 0, outTiyin: 0, movements: [] },
      [],
    )).toEqual({ inPercent: 0, outPercent: 0 });
  });
});
