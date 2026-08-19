import { describe, expect, it } from 'vitest';
import { HELP_CATEGORIES, HELP_ITEMS, searchHelpItems } from './help-data';

describe('help-data', () => {
  it('has all required categories with icons and descriptions', () => {
    expect(HELP_CATEGORIES.length).toBeGreaterThanOrEqual(6);
    const categoryIds = HELP_CATEGORIES.map((c) => c.id);
    expect(categoryIds).toContain('all');
    expect(categoryIds).toContain('start');
    expect(categoryIds).toContain('safety');
    expect(categoryIds).toContain('buyer');
    expect(categoryIds).toContain('seller');
    expect(categoryIds).toContain('wallet');
    expect(categoryIds).toContain('faq');
  });

  it('contains well-structured help items across categories', () => {
    expect(HELP_ITEMS.length).toBeGreaterThanOrEqual(10);
    for (const item of HELP_ITEMS) {
      expect(item.id).toBeTruthy();
      expect(item.title).toBeTruthy();
      expect(item.summary).toBeTruthy();
      expect(item.content.length).toBeGreaterThan(0);
      expect(item.tags.length).toBeGreaterThan(0);
    }
  });

  it('filters items correctly by category', () => {
    const safetyItems = searchHelpItems('', 'safety');
    expect(safetyItems.length).toBeGreaterThan(0);
    expect(safetyItems.every((item) => item.category === 'safety')).toBe(true);

    const allItems = searchHelpItems('', 'all');
    expect(allItems.length).toBe(HELP_ITEMS.length);
  });

  it('searches items by keyword matching title, summary, content, or tags', () => {
    const konamiResults = searchHelpItems('konami');
    expect(konamiResults.length).toBeGreaterThan(0);

    const escrowResults = searchHelpItems('garov');
    expect(escrowResults.length).toBeGreaterThan(0);

    const emptyResults = searchHelpItems('xyznonexistentterm9999');
    expect(emptyResults).toHaveLength(0);
  });

  it('combines category filter and query filter', () => {
    const results = searchHelpItems('konami', 'safety');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((item) => item.category === 'safety')).toBe(true);

    const noMatches = searchHelpItems('konami', 'wallet');
    expect(noMatches).toHaveLength(0);
  });
});
