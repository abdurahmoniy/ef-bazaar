import type { PlatformCardResponse } from './payment-types';

/**
 * Ordering rules for the admin card grid.
 *
 * `POST /cards/reorder` rewrites `display_order` for **every active card in one
 * call** and rejects a list that is not exactly the active set
 * (`PlatformCardService.reorder` → 400). So the payload is always the whole
 * active sequence, never the pair that moved.
 *
 * Inactive cards keep whatever `display_order` they had and must stay out of
 * the payload entirely.
 */

export interface SplitCards {
  active: PlatformCardResponse[];
  inactive: PlatformCardResponse[];
}

/** Active first, in the server's order; deactivated ones collected after. */
export function splitCards(cards: PlatformCardResponse[]): SplitCards {
  const active = cards.filter((card) => card.active)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const inactive = cards.filter((card) => !card.active);
  return { active, inactive };
}

/**
 * Swaps a card with its neighbour. Returns the same array reference when the
 * move is impossible — the caller uses that to skip a pointless round trip.
 */
export function moveCard(
  active: PlatformCardResponse[],
  id: string,
  delta: -1 | 1,
): PlatformCardResponse[] {
  const from = active.findIndex((card) => card.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= active.length) return active;

  const moved = [...active];
  [moved[from], moved[to]] = [moved[to], moved[from]];
  return moved;
}

/** The `orderedIds` body the backend expects. */
export function orderedIds(active: PlatformCardResponse[]): string[] {
  return active.map((card) => card.id);
}
