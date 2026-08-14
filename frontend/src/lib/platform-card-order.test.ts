import { describe, expect, it } from 'vitest';

import { moveCard, orderedIds, splitCards } from './platform-card-order';
import type { PlatformCardResponse } from './payment-types';

function card(
  id: string,
  displayOrder: number,
  active = true,
): PlatformCardResponse {
  return {
    id,
    maskedPan: `**** **** **** ${id.repeat(4).slice(0, 4)}`,
    last4: id.repeat(4).slice(0, 4),
    holderName: 'EFBAZAAR MCHJ',
    expiryMonth: 12,
    expiryYear: 2029,
    brand: 'HUMO',
    displayOrder,
    active,
  };
}

describe('splitCards', () => {
  it('puts the active cards first, in display order', () => {
    const split = splitCards([card('c', 3), card('a', 1), card('b', 2)]);
    expect(split.active.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(split.inactive).toEqual([]);
  });

  it('keeps deactivated cards out of the active sequence', () => {
    const split = splitCards([card('a', 1), card('x', 2, false), card('b', 3)]);
    expect(split.active.map((c) => c.id)).toEqual(['a', 'b']);
    expect(split.inactive.map((c) => c.id)).toEqual(['x']);
  });

  it('does not mutate the array it was given', () => {
    const cards = [card('c', 3), card('a', 1)];
    splitCards(cards);
    expect(cards.map((c) => c.id)).toEqual(['c', 'a']);
  });
});

describe('moveCard', () => {
  const active = [card('a', 1), card('b', 2), card('c', 3)];

  it('swaps a card with the one above it', () => {
    expect(moveCard(active, 'c', -1).map((c) => c.id)).toEqual(['a', 'c', 'b']);
  });

  it('swaps a card with the one below it', () => {
    expect(moveCard(active, 'a', 1).map((c) => c.id)).toEqual(['b', 'a', 'c']);
  });

  it('returns the same array when the move runs off either end', () => {
    expect(moveCard(active, 'a', -1)).toBe(active);
    expect(moveCard(active, 'c', 1)).toBe(active);
  });

  it('returns the same array for an id it does not hold', () => {
    expect(moveCard(active, 'zzz', -1)).toBe(active);
  });

  it('leaves the original array untouched', () => {
    moveCard(active, 'a', 1);
    expect(active.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('orderedIds', () => {
  /**
   * The backend refuses a list that is not exactly the active set, so the
   * payload is built from the active sequence alone.
   */
  it('is the active sequence, in the order shown', () => {
    const { active } = splitCards([card('a', 1), card('x', 2, false), card('b', 3)]);
    expect(orderedIds(moveCard(active, 'b', -1))).toEqual(['b', 'a']);
  });
});
