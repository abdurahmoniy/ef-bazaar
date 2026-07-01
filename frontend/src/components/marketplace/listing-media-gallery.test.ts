import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ListingMediaGallery } from './listing-media-gallery';

describe('ListingMediaGallery', () => {
  it('renders a primary image and thumbnail strip for listing media', () => {
    const markup = renderToStaticMarkup(
      createElement(ListingMediaGallery, {
        title: 'Strong account',
        urls: ['/bot/photo/file-1', '/bot/photo/file-2'],
      }),
    );

    expect(markup).toContain('src="/bot/photo/file-1"');
    expect(markup).toContain('src="/bot/photo/file-2"');
    expect(markup).toContain('alt="Strong account rasmi 1"');
    expect(markup).toContain('alt="Strong account rasmi 2"');
  });
});
