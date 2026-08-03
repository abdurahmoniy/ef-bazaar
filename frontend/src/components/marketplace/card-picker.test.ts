import { describe, expect, it } from 'vitest';

import { cardSelectionBlockReason, type PlayerCard } from './card-picker';

const card = (efhubId: number, playerId: string): PlayerCard => ({
  efhubId,
  playerId,
  name: `Player ${efhubId}`,
});

describe('cardSelectionBlockReason', () => {
  it('distinguishes card-edition duplicates from canonical-player duplicates', () => {
    const selected = [card(101, '11111111-1111-4111-8111-111111111111')];

    expect(cardSelectionBlockReason(selected, card(101, '22222222-2222-4222-8222-222222222222'), 30))
      .toBe('card');
    expect(cardSelectionBlockReason(selected, card(202, '11111111-1111-4111-8111-111111111111'), 30))
      .toBe('player');
    expect(cardSelectionBlockReason(selected, card(303, '33333333-3333-4333-8333-333333333333'), 30))
      .toBeNull();
  });

  it('enforces the configured thirty-card boundary', () => {
    const selected = Array.from({ length: 30 }, (_, index) =>
      card(index, `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`));

    expect(cardSelectionBlockReason(selected, card(999, '99999999-9999-4999-8999-999999999999'), 30))
      .toBe('limit');
  });
});
