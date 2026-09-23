import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ProfileBalance } from './profile-balance';

it('shows available balance converted from tiyin and links to the wallet', () => {
  const html = renderToStaticMarkup(createElement(ProfileBalance, { availableTiyin: 1234500 }));
  expect(html.replace(/\s/g, '')).toContain('12345');
  expect(html).toContain('href="/hamyon"');
  expect(html).toContain('Hamyonni ochish');
});
it('distinguishes a zero balance from an unavailable balance', () => {
  expect(renderToStaticMarkup(createElement(ProfileBalance, { availableTiyin: 0 }))).toContain('0');
  const missing = renderToStaticMarkup(createElement(ProfileBalance, { availableTiyin: null }));
  expect(missing).toContain('Balans yuklanmadi');
  expect(missing).toContain('href="/hamyon"');
});
