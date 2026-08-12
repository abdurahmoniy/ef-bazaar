import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ListingsPagination } from './listings-pagination';

function renderPagination(page: number, totalPages: number) {
  const buildHref = vi.fn((requestedPage: number) => (
    `/marketplace?q=Messi&tracking=feed&page=${requestedPage}`
  ));
  const markup = renderToStaticMarkup(createElement(ListingsPagination, {
    page,
    totalPages,
    buildHref,
  }));
  return { markup, buildHref };
}

describe('ListingsPagination', () => {
  it('renders nothing when there is only one page', () => {
    const { markup, buildHref } = renderPagination(0, 1);

    expect(markup).toBe('');
    expect(buildHref).not.toHaveBeenCalled();
  });

  it('renders compact 44px mobile controls with the current-page summary', () => {
    const { markup } = renderPagination(1, 12);

    expect(markup).toContain('aria-label="Sahifalash"');
    expect(markup).toContain('sm:hidden');
    expect(markup).toContain('2 / 12');
    expect(markup).toContain('href="/marketplace?q=Messi&amp;tracking=feed&amp;page=0"');
    expect(markup).toContain('href="/marketplace?q=Messi&amp;tracking=feed&amp;page=2"');
    expect((markup.match(/min-h-11 min-w-11/g) ?? [])).toHaveLength(8);
  });

  it('keeps bounded numeric pages and ellipses on desktop', () => {
    const { markup } = renderPagination(5, 12);

    expect(markup).toContain('hidden items-center justify-center gap-1 sm:flex');
    expect((markup.match(/aria-hidden="true"[^>]*>…/g) ?? [])).toHaveLength(2);
    expect(markup).toContain(
      'aria-current="page" href="/marketplace?q=Messi&amp;tracking=feed&amp;page=5"',
    );
    expect(markup).toContain('>1</a>');
    expect(markup).toContain('>5</a>');
    expect(markup).toContain('>6</a>');
    expect(markup).toContain('>7</a>');
    expect(markup).toContain('>12</a>');
    expect(markup).not.toContain('>2</a>');
    expect(markup).not.toContain('>10</a>');
  });

  it('uses semantic disabled edges without discarding their requested page', () => {
    const first = renderPagination(0, 3);
    const last = renderPagination(2, 3);

    expect(first.markup).toContain('aria-disabled="true"');
    expect(first.markup).toContain('aria-label="Oldingi"');
    expect(first.buildHref).toHaveBeenCalledWith(0);
    expect(first.buildHref).toHaveBeenCalledWith(1);

    expect(last.markup).toContain('aria-disabled="true"');
    expect(last.markup).toContain('aria-label="Keyingi"');
    expect(last.buildHref).toHaveBeenCalledWith(1);
    expect(last.buildHref).toHaveBeenCalledWith(2);
  });

  it('routes enabled navigation through the pending-link browser fallback', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/marketplace/listings-pagination.tsx'),
      'utf8',
    );

    expect(source).toContain("import { MarketplacePendingLink }");
    expect(source).toContain('<MarketplacePendingLink');
    expect(source).not.toContain("import Link from 'next/link'");
  });
});
