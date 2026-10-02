import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MARKETPLACE_NOTICE_TEXT, MarketplaceTabs } from './marketplace-tabs';

describe('MarketplaceTabs', () => {
  it('links both tabs and marks the active one', () => {
    const html = renderToStaticMarkup(createElement(MarketplaceTabs, {
      active: 'mine', rawQuery: 'minPrice=5&page=2',
    }));
    expect(html).toContain('Qiziqishlarim');
    expect(html).toContain('Katta bozor');
    expect(html).toContain('href="/marketplace?minPrice=5"');
    expect(html).toContain('href="/marketplace?minPrice=5&amp;tab=market"');
    expect(html).toMatch(/aria-current="page"[^>]*><span[^>]*>Qiziqishlarim</);
  });

  /** Telegram WebView'da shrift kattaroq — matn ikki qatorga bo'linib chetga surilmasin. */
  it('keeps each tab label on one centered line', () => {
    const html = renderToStaticMarkup(createElement(MarketplaceTabs, { active: 'mine', rawQuery: '' }));
    const links = html.match(/<a [^>]*>/g) ?? [];
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toContain('text-center');
      expect(link).toContain('whitespace-nowrap');
      expect(link).toContain('min-w-0');
    }
    expect(html).toContain('truncate');
  });

  it('has a sentence for every notice', () => {
    expect(MARKETPLACE_NOTICE_TEXT.feed_empty).toMatch(/like/i);
    expect(MARKETPLACE_NOTICE_TEXT.rec_unavailable).toMatch(/Katta bozor/);
  });
});

describe('marketplace browser wiring', () => {
  const browser = readFileSync(resolve(process.cwd(), 'src/components/marketplace/marketplace-browser.tsx'), 'utf8');

  it('guest sees no tabs', () => {
    expect(browser).toMatch(/authenticated\s*&&\s*\(?\s*<MarketplaceTabs/);
  });

  it('sort menu exists only in the market mode', () => {
    expect(browser).toMatch(/mode === 'market'\s*\?\s*sortOptions\s*:\s*\[\]/);
  });
});
