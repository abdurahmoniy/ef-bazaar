// @vitest-environment jsdom

import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ListingViewCount } from './listing-view-count';

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  root = createRoot(container);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it('does not record views during server rendering or preloading', () => {
  const html = renderToStaticMarkup(createElement(ListingViewCount, {
    listingId: 'listing-1', initialCount: 7, track: true,
  }));
  expect(html).toContain('7');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('records one opened page even under Strict Mode and shows the returned count', async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ viewCount: 8 }) });
  await act(async () => root.render(createElement(StrictMode, null,
    createElement(ListingViewCount, { listingId: 'listing-1', initialCount: 7, track: true }),
  )));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith('/api/marketplace/v1/listings/listing-1/views', {
    method: 'POST',
  });
  expect(container.textContent).toBe("Ko'rishlar: 8");
});

it('shows the saved count without tracking owner or inactive listings', async () => {
  await act(async () => root.render(createElement(ListingViewCount, {
    listingId: 'listing-1', initialCount: 7, track: false,
  })));
  expect(fetchMock).not.toHaveBeenCalled();
  expect(container.textContent).toBe("Ko'rishlar: 7");
});

it.each([
  () => Promise.reject(new Error('offline')),
  () => Promise.resolve({ ok: false }),
  () => Promise.resolve({ ok: true, json: async () => ({ viewCount: 'invalid' }) }),
])('keeps the saved count when tracking fails', async (response) => {
  fetchMock.mockImplementation(response);
  await act(async () => root.render(createElement(ListingViewCount, {
    listingId: 'listing-1', initialCount: 7, track: true,
  })));
  expect(container.textContent).toBe("Ko'rishlar: 7");
});
