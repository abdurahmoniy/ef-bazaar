import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { SaveSearchLink } from './save-search-link';
it('makes the current filter draft available to the owner save form without changing the browse URL', () => {
  const html = renderToStaticMarkup(createElement(SaveSearchLink, { rawQuery: 'minPrice=100&matchCard=101:card:P' }));
  expect(html).toContain('/watches?criteria=minPrice%3D100%26matchCard%3D101%3Acard%3AP');
  expect(html).toContain('Qidiruvni saqlash');
});
