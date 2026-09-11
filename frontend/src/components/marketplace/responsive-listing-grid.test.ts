import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  ResponsiveListingGrid,
  ResponsiveListingGridSkeleton,
} from './responsive-listing-grid';
import type { ListingResponse } from '@/lib/marketplace-types';
import type { MarketplaceView } from '@/lib/marketplace-query';

vi.mock('next/image', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    default: ({ fill: _fill, priority, ...props }: Record<string, unknown>) => React.createElement(
      'img',
      { ...props, 'data-priority': priority ? 'true' : undefined },
    ),
  };
});

function listing(id: string): ListingResponse {
  return {
    id,
    sellerId: 'seller-1',
    description: `Listing ${id}`,
    price: 500000,
    priceNegotiable: false,
    attributes: {},
    mediaMessageIds: [`photo-${id}`],
    status: 'ACTIVE',
    forwardCount: 0,
    likeCount: 0,
    likedByMe: false,
    createdAt: '2026-08-11T00:00:00Z',
    updatedAt: '2026-08-11T00:00:00Z',
  };
}

describe('ResponsiveListingGrid', () => {
  it.each([
    ['auto', 'auto'],
    ['list', 'horizontal'],
    ['grid', 'vertical'],
  ] satisfies [MarketplaceView, string][])('maps %s view to %s cards and preserves the raw query', (view, layout) => {
    const markup = renderToStaticMarkup(createElement(ResponsiveListingGrid, {
      listings: [listing('listing-1'), listing('listing-2')],
      view,
      rawQuery: 'q=Messi&tracking=one&tracking=two',
      matchCriteria: [],
    }));

    expect(markup).toContain('class="marketplace-results-container"');
    expect(markup).toContain(`data-view="${view}"`);
    expect((markup.match(new RegExp(`data-layout="${layout}"`, 'g')) ?? [])).toHaveLength(2);
    expect(markup).toContain('data-marketplace-listing-id="listing-1"');
    expect(markup).toContain('data-marketplace-listing-id="listing-2"');
    expect(markup).toContain(
      'href="/marketplace/listing-1?q=Messi&amp;tracking=one&amp;tracking=two"',
    );
    expect(markup).toContain(
      'href="/marketplace/listing-2?q=Messi&amp;tracking=one&amp;tracking=two"',
    );
  });

  it('prioritizes only the first feed image', () => {
    const markup = renderToStaticMarkup(createElement(ResponsiveListingGrid, {
      listings: [listing('listing-1'), listing('listing-2')],
      view: 'auto',
      rawQuery: '',
      matchCriteria: [],
    }));

    expect((markup.match(/data-priority="true"/g) ?? [])).toHaveLength(1);
  });

  it('renders a same-geometry compact, non-navigating Auto skeleton', () => {
    const markup = renderToStaticMarkup(createElement(ResponsiveListingGridSkeleton, {
      count: 4,
    }));

    expect(markup).toContain('class="marketplace-results-container"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-label="E‘lonlar yuklanmoqda"');
    expect(markup).toContain('data-view="auto"');
    expect((markup.match(/data-layout="auto"/g) ?? [])).toHaveLength(4);
    expect((markup.match(/aspect-\[19\.5\/9\]/g) ?? [])).toHaveLength(4);
    expect((markup.match(/data-skeleton-price/g) ?? [])).toHaveLength(4);
    expect((markup.match(/data-skeleton-facts/g) ?? [])).toHaveLength(4);
    expect(markup).toContain('listing-card__facts');
    expect(markup).not.toContain('grid-cols-2');
    expect(markup).not.toContain('data-skeleton-description');
    expect(markup).not.toContain('href=');
    expect(markup).not.toContain('data-marketplace-listing-id');
  });

  it('restores two columns on Telegram phone containers and caps Auto at three columns', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');

    expect(css).toContain('.marketplace-results-container');
    expect(css).toContain('container-type: inline-size');
    expect(css).toContain('@container (min-width: 300px)');
    expect(css).not.toContain('@container (min-width: 520px)');
    expect(css).not.toContain('@container (min-width: 380px)');
    expect(css).toContain('@container (min-width: 696px)');
    expect(css).toMatch(/marketplace-listings:not\(\[data-view='list'\]\)[^{]*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/s);
    expect(css).toMatch(/@container \(min-width: 696px\)[^{]*\{[^}]*marketplace-listings:not\(\[data-view='list'\]\)[^{]*\{[^}]*repeat\(3, minmax\(0, 1fr\)\)/s);
    expect(css).not.toMatch(/marketplace-listings[^}]*repeat\(4/);
    expect(css).toMatch(/listing-card\[data-layout='horizontal'\][^{]*,[\s\S]*listing-card\[data-layout='vertical'\][^{]*\{[^}]*flex-direction:\s*column/s);
    expect(css).toMatch(/\.listing-card\s*\{[^}]*container-type:\s*inline-size/s);
    expect(css).toMatch(/@container \(min-width: 360px\)[\s\S]*\.listing-card__facts[^}]*repeat\(2, minmax\(0, 1fr\)\)/s);
    expect(css).toMatch(/\.listing-card__facts > :only-child\s*\{[^}]*grid-column:\s*1 \/ -1/s);
  });

  it('is the marketplace browser feed and loading geometry boundary', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/marketplace/marketplace-browser.tsx'),
      'utf8',
    );

    expect(source).toContain('<ResponsiveListingGrid');
    expect(source).toContain('rawQuery={currentQuery}');
    expect(source).toContain('matchCriteria={activeMatch.criteria}');
    expect(source).toContain('<ResponsiveListingGridSkeleton');
    expect(source).not.toContain('variant={displayView}');
  });
});
