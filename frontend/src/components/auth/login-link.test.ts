// @vitest-environment jsdom

import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';

const location = vi.hoisted(() => ({ pathname: '/marketplace' as string | null, search: '' }));
vi.mock('next/navigation', () => ({
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams(location.search),
}));
vi.mock('next/link', () => ({
  default: ({ children, prefetch: _prefetch, ...props }: ComponentProps<'a'> & { prefetch?: boolean }) => createElement('a', props, children),
}));

import { LoginLink } from './login-link';

const hrefOf = () => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(createElement(LoginLink, { className: 'btn' } as ComponentProps<typeof LoginLink>, 'Kirish'));
  const link = host.querySelector('a')!;
  return { link, url: new URL(link.getAttribute('href')!, 'https://efbazaar.uz') };
};

beforeEach(() => {
  location.pathname = '/marketplace';
  location.search = '';
});

it('sends the visitor back to the page they were on after login', () => {
  location.pathname = '/marketplace/listing-1';
  location.search = 'ref=share';
  const { link, url } = hrefOf();
  expect(url.pathname).toBe('/auth/login');
  expect(url.searchParams.get('from')).toBe('/marketplace/listing-1?ref=share');
  expect(link.className).toBe('btn');
  expect(link.textContent).toBe('Kirish');
});

it('falls back to the plain login page when the route is unknown', () => {
  location.pathname = null;
  expect(hrefOf().link.getAttribute('href')).toBe('/auth/login');
});
