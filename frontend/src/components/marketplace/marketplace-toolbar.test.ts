import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MarketplaceToolbar } from './marketplace-toolbar';
import { marketplaceViewOptions } from './marketplace-view-menu';

const toolbar = readFileSync(new URL('./marketplace-toolbar.tsx', import.meta.url), 'utf8');
const view = readFileSync(new URL('./marketplace-view-menu.tsx', import.meta.url), 'utf8');
const sort = readFileSync(new URL('./sort-menu.tsx', import.meta.url), 'utf8');
const browser = readFileSync(new URL('./marketplace-browser.tsx', import.meta.url), 'utf8');
const filters = readFileSync(new URL('./listing-filters.tsx', import.meta.url), 'utf8');
const playerDialog = readFileSync(new URL('./player-filter-dialog.tsx', import.meta.url), 'utf8');
const globals = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');

describe('marketplace mobile toolbar contract', () => {
  it('keeps the two buyer actions visible and all four targets touch-sized', () => {
    expect(toolbar).toContain('filterTrigger');
    expect(toolbar).toContain('playerTrigger');
    expect(toolbar).toContain('marketplace-toolbar-actions');
    expect(toolbar).toContain('min-h-11');
    expect(toolbar.match(/\[&>button\]:min-h-11/g)).toHaveLength(2);
    expect(view).toContain('min-h-11');
    expect(sort).toContain('min-h-11');
    expect(globals).toContain('grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);');
    expect(globals).toContain('@media (min-width: 360px)');
    expect(globals).toContain('minmax(0, 0.82fr) minmax(0, 1.18fr) 44px 44px');
  });

  it('exposes Auto, list, and grid as explicit accessible choices', () => {
    expect(marketplaceViewOptions()).toEqual([
      { value: 'auto', label: 'Auto' },
      { value: 'list', label: 'Ro‘yxat' },
      { value: 'grid', label: 'Katak' },
    ]);
    expect(view).toContain('aria-current');
    expect(view).toContain('useTelegramBackLayer');
    expect(view).toContain("kind: 'overlay'");
  });

  it('closes both menus on escape, outside click, native back, and selection', () => {
    for (const source of [view, sort]) {
      expect(source).toContain("event.key === 'Escape'");
      expect(source).toContain("document.addEventListener('pointerdown'");
      expect(source).toContain('useTelegramBackLayer');
      expect(source).toContain('setOpen(false)');
    }
    expect(view).toContain('MarketplacePendingLink');
    expect(sort).toContain('MarketplacePendingLink');
  });

  it('renders separate buyer-action counts and an accessible result heading', () => {
    const markup = renderToStaticMarkup(createElement(MarketplaceToolbar, {
      title: 'eFootball akkountlar',
      totalElements: 124,
      filterTrigger: createElement('button', null, 'Filtrlar', createElement('b', null, '3')),
      playerTrigger: createElement('button', null, 'O‘yinchilar', createElement('b', null, '7')),
      sortOptions: [{ id: 'newest', label: 'Eng yangi', href: '/marketplace?sort=new' }],
      activeSortId: 'newest',
      activeSortLabel: 'Eng yangi',
      rawQuery: 'q=Messi&matchCard=1%3Ap%3AN&matchCard=2%3Ap2%3AP',
      view: 'auto',
      quickChips: null,
    }));

    expect(markup).toContain('Filtrlar');
    expect(markup).toContain('O‘yinchilar');
    expect(markup).toContain('124 ta e‘lon');
    expect(markup).toContain('id="marketplace-results-heading"');
    expect(markup).toContain('tabindex="-1"');
    expect(browser).toContain('<MarketplaceResultsRegion>');
    expect(toolbar).toContain('aria-labelledby="marketplace-results-heading"');
    expect(toolbar).toContain('aria-busy={navigation?.pending || undefined}');
  });

  it('removes the old header, view links, and player summary banner', () => {
    expect(browser).not.toContain('function BrowseHeader');
    expect(browser).not.toContain('LayoutGrid');
    expect(browser).not.toContain('strictnessLabel');
    expect(filters).toContain('MarketplacePendingLink');
    expect(filters).toContain('telegramHaptic');
    expect(filters).toContain('filter.id === activeFilter) return');
    expect(playerDialog).toContain('<span>O‘yinchilar</span>');
  });
});
