import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./match-breakdown.tsx', import.meta.url), 'utf8');

describe('MatchBreakdown contract', () => {
  it('explains exact, alternate, missing, priority, and weighted score', () => {
    expect(source).toContain('details.exactEfhubIds');
    expect(source).toContain('details.alternateEfhubIds');
    expect(source).toContain('details.missingEfhubIds');
    expect(source).toContain('details.priorityEfhubIds');
    expect(source).toContain('Vaznli ball');
    expect(source).toContain('Boshqa nashr (75%)');
    expect(source).toContain('aria-label="Ustuvor: 3 karra"');
  });

  it('never exposes internal card ids as buyer-facing fallback copy', () => {
    expect(source).toContain('Tanlangan karta');
    expect(source).not.toContain('Karta #');
    expect(source).not.toContain('Maqsad karta #');
  });
});
