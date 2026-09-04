import { describe, expect, it } from 'vitest';

import { bpToPercent, percentToBp } from '@/lib/partners';

describe('basis points', () => {
  it('shows the admin a percentage, stores basis points', () => {
    // Baza asos punktida saqlaydi: 10.5% ni butun songa sig'dirib
    // bo'lmaydi, kasrli tur esa savdo yopilishida yaxlitlash bahsini
    // ochadi. Admin esa foiz ko'radi.
    expect(bpToPercent(1000)).toBe(10);
    expect(bpToPercent(1050)).toBe(10.5);
    expect(percentToBp(10)).toBe(1000);
    expect(percentToBp(10.5)).toBe(1050);
  });

  it('round-trips without drifting', () => {
    for (const bp of [0, 1, 250, 1000, 1050, 10000]) {
      expect(percentToBp(bpToPercent(bp))).toBe(bp);
    }
  });

  it('rounds a percentage the input cannot represent exactly', () => {
    // 10.333% ni admin yozishi mumkin; baza butun asos punkti kutadi.
    expect(percentToBp(10.333)).toBe(1033);
  });
});
