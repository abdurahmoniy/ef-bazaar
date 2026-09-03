import { describe, expect, it } from 'vitest';

import { formatEarned, referrerLabel, sortByInvited } from '@/lib/admin-referrals';

describe('sortByInvited', () => {
  it('ranks the busiest referrer first', () => {
    const rows = [
      { userId: 'a', invitedCount: 3, rewardedCount: 1, earnedSom: 5000 },
      { userId: 'b', invitedCount: 9, rewardedCount: 4, earnedSom: 20000 },
    ];
    expect(sortByInvited(rows).map((r) => r.userId)).toEqual(['b', 'a']);
  });

  it('breaks a tie by what was actually earned', () => {
    const rows = [
      { userId: 'a', invitedCount: 5, rewardedCount: 1, earnedSom: 5000 },
      { userId: 'b', invitedCount: 5, rewardedCount: 3, earnedSom: 15000 },
    ];
    expect(sortByInvited(rows).map((r) => r.userId)).toEqual(['b', 'a']);
  });

  it('does not mutate the array it was given', () => {
    const rows = [
      { userId: 'a', invitedCount: 1, earnedSom: 0 },
      { userId: 'b', invitedCount: 9, earnedSom: 0 },
    ];
    sortByInvited(rows);
    expect(rows.map((r) => r.userId)).toEqual(['a', 'b']);
  });
});

describe('formatEarned', () => {
  it('groups thousands', () => {
    expect(formatEarned(1234567).replace(/\s/g, ' ')).toBe('1 234 567');
  });

  it('shows a dash rather than a zero for a referrer who has earned nothing', () => {
    expect(formatEarned(0)).toBe('—');
  });
});

describe('referrerLabel', () => {
  const base = { userId: '3f2b91c4-7a1e-4d88', invitedCount: 0, rewardedCount: 0, earnedSom: 0 };

  it('prefers the display name', () => {
    expect(referrerLabel({ ...base, displayName: 'Aziz', telegramUsername: 'aziz' })).toBe('Aziz');
  });

  it('falls back to the telegram username', () => {
    expect(referrerLabel({ ...base, displayName: null, telegramUsername: 'aziz' })).toBe('@aziz');
  });

  it('still identifies a row auth knows nothing about', () => {
    // Ismsiz qator TASHLANMAYDI — sanoq ismga emas, referalga bog'liq.
    expect(referrerLabel({ ...base, displayName: null, telegramUsername: null })).toBe('3f2b91c4');
  });
});
