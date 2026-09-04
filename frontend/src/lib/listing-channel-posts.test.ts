import { describe, expect, it } from 'vitest';

import { postedAgo } from './partner-channels';

describe('postedAgo', () => {
  const now = new Date('2026-09-04T12:00:00Z');

  it('says how buried a post is, not what date it was', () => {
    // The seller's question is "is it still near the top or has it
    // scrolled away", and a calendar date makes them do that subtraction
    // themselves at the moment they are deciding whether to pay again.
    expect(postedAgo('2026-09-01T09:00:00Z', now)).toBe('3 kun oldin');
    expect(postedAgo('2026-09-03T09:00:00Z', now)).toBe('kecha');
    expect(postedAgo('2026-09-04T09:00:00Z', now)).toBe('bugun');
  });

  it('treats a never-posted channel as never posted, not as today', () => {
    // An order can sit in AWAITING_FUNDS or fail outright. Reading that
    // as "posted today" would talk the seller out of a repost that never
    // happened in the first place.
    expect(postedAgo(null, now)).toBe('hali chiqmagan');
    expect(postedAgo('not-a-date', now)).toBe('hali chiqmagan');
  });
});
