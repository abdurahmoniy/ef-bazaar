import { describe, expect, it } from 'vitest';
import { savedSearchFromQuery, savedSearchHref, watchErrorMessage } from './watches';

const card = '101:00000000-0000-4000-8000-000000000001:P';

describe('saved search supported criteria', () => {
  it('retains cards, strictness and integer som prices while excluding unsupported browse filters', () => {
    const draft = savedSearchFromQuery(new URLSearchParams({ matchCard: card, matchStrictness: '7', minPrice: '100000', maxPrice: '900000', search: 'Messi', platform: 'STEAM', 'attr.team_strength': '3000' }));
    expect(draft).toEqual({ matchCard: [card], matchStrictness: 7, minPrice: 100000, maxPrice: 900000 });
    const href = savedSearchHref(draft);
    expect(href).toContain('minPrice=100000');
    expect(href).not.toMatch(/search|platform|attr\./);
  });
  it('does not silently broaden malformed or reversed prices', () => {
    for (const query of ['minPrice=-1', 'maxPrice=1.5', 'minPrice=200&maxPrice=100', 'minPrice=oops']) {
      expect(() => savedSearchFromQuery(new URLSearchParams(query))).toThrow();
    }
  });
  it('rejects empty and unsupported-only queries rather than saving every listing', () => {
    expect(() => savedSearchFromQuery(new URLSearchParams('search=Messi&platform=STEAM'))).toThrow();
    expect(() => savedSearchFromQuery(new URLSearchParams('matchCard=invalid'))).toThrow();
  });
  it('keeps readiness, quota and permission errors distinct', () => {
    expect(watchErrorMessage(503, { code: 'plan_not_ready' })).toMatch(/aniqlan|tayyor|yangilan/);
    expect(watchErrorMessage(409, { code: 'watch_limit' })).toMatch(/limit/i);
    expect(watchErrorMessage(403, {})).toMatch(/ruxsat|Kirish/);
    expect(watchErrorMessage(500, {})).toMatch(/Qayta/);
  });
});
