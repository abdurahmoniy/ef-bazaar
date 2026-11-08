import { describe, expect, it } from 'vitest';

import { conversion } from './campaigns';

describe('conversion', () => {
  it('rounds the share of the previous stage', () => {
    expect(conversion(1, 3)).toBe('33%');
    expect(conversion(2, 2)).toBe('100%');
  });

  it('shows a dash instead of dividing by zero', () => {
    expect(conversion(0, 0)).toBe('—');
  });
});
