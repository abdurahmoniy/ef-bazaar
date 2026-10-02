import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFileSync(resolve(process.cwd(), 'src', file), 'utf8');

describe('recommendation wiring', () => {
  it('player filter loads dream teams and records interest through rec', () => {
    const launcher = source('components/marketplace/player-filter-launcher.tsx');
    expect(launcher).toContain("buildMarketplaceApiPath(['v1', 'dream-teams'], undefined, REC_API_BASE)");
    expect(launcher).toContain("buildMarketplaceApiPath(['v1', 'card-interest', 'apply'], undefined, REC_API_BASE)");
  });

  it('listing page asks rec for match details and marketplace only for the listing', () => {
    const page = source('app/marketplace/[id]/page.tsx');
    expect(page).toContain('getListingMatch(id, matchFilters.matchCards, matchFilters.matchStrictness)');
    expect(page).not.toMatch(/getListing\(id, matchFilters/);
  });

  it('dream team page and admin demand read from rec', () => {
    expect(source('app/dream-team/page.tsx')).toContain("from '@/lib/rec-server'");
    expect(source('app/admin/players/page.tsx')).toContain('getCardInterestCounts(');
    expect(source('lib/marketplace-server.ts')).not.toContain('dream-teams');
  });
});
