import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { WatchNotification } from './watch-notification';
it('renders retained watch reasons and som price movement as text with a remaining count', () => {
  const html = renderToStaticMarkup(createElement(WatchNotification, { payload: { items: [{ listingId: 'l1', reasons: ['Messi <script>', 'Narx pasaydi'], oldPrice: 200000, newPrice: 150000 }], totalCount: 22, remainingCount: 21 } }));
  expect(html).toContain('Messi &lt;script&gt;'); expect(html).toContain('Narx pasaydi');
  expect(html).toContain('200 000'); expect(html).toContain('150 000'); expect(html).toContain('so‘m');
  expect(html).toContain('href="/marketplace/l1"');
  expect(html).toContain('21'); expect(html).not.toContain('<script>');
});
