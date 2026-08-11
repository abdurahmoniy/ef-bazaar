import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AppliedFilterChips } from './applied-filter-chips';

describe('AppliedFilterChips', () => {
  it('does not repeat the visible filter label in the hidden removal suffix', () => {
    const markup = renderToStaticMarkup(createElement(AppliedFilterChips, {
      items: [{
        id: 'search',
        kind: 'search',
        label: 'Qidiruv: Messi',
        keys: ['q', 'search'],
        href: '/marketplace',
      }],
      rawQuery: 'q=Messi',
    }));

    expect(markup).toContain('<span class="sr-only">filtrini olib tashlash</span>');
    expect(markup).not.toContain(
      '<span class="sr-only">Qidiruv: Messi filtrini olib tashlash</span>',
    );
  });
});
