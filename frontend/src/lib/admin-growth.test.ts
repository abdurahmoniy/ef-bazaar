import { describe, expect, it } from 'vitest';

import { barHeights, netLabel } from './admin-growth';

describe('barHeights', () => {
  it('scales against the busiest day and keeps non-zero days visible', () => {
    expect(barHeights([0, 1, 100], 100)).toEqual([0, 4, 100]);
    expect(barHeights([5, 10], 100)).toEqual([50, 100]);
  });

  it('draws nothing tall when every day is empty', () => {
    expect(barHeights([0, 0], 100)).toEqual([0, 0]);
  });
});

describe('netLabel', () => {
  it('signs the net change of the channel', () => {
    expect(netLabel(5, 2)).toBe('+3');
    expect(netLabel(2, 5)).toBe('−3');
    expect(netLabel(1, 1)).toBe('0');
  });
});
