// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ListingMediaGallery } from './listing-media-gallery';
vi.mock('next/image', () => ({ default: ({ fill: _fill, ...props }: Record<string, unknown>) => createElement('img', props) }));
vi.mock('./zoomable-lightbox', () => ({ ZoomableLightbox: () => createElement('div', { 'data-lightbox': true }) }));
const host = document.createElement('div');
const root = createRoot(host);
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(async () => { await act(async () => root.render(null)); });
async function touch(target: Element, type: string, points: { clientX: number; clientY: number }[]) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, type === 'touchend' ? 'changedTouches' : 'touches', { value: points });
  await act(async () => { target.dispatchEvent(event); });
}
it('swipes images without opening the lightbox and ignores vertical or multitouch gestures', async () => {
  await act(async () => root.render(createElement(ListingMediaGallery, { title: 'Account', urls: ['/a.jpg', '/b.jpg'] })));
  const area = host.querySelector('[aria-label="Rasmni kattalashtirish"]')!;
  await touch(area, 'touchstart', [{ clientX: 200, clientY: 80 }]);
  await touch(area, 'touchend', [{ clientX: 70, clientY: 85 }]);
  expect(area.querySelector('img')?.getAttribute('alt')).toBe('Account rasmi 2');
  await act(async () => (area as HTMLElement).click());
  expect(host.querySelector('[data-lightbox]')).toBeNull();
  await touch(area, 'touchstart', [{ clientX: 200, clientY: 80 }]);
  await touch(area, 'touchend', [{ clientX: 180, clientY: 250 }]);
  expect(area.querySelector('img')?.getAttribute('alt')).toBe('Account rasmi 2');
  await touch(area, 'touchstart', [{ clientX: 200, clientY: 80 }, { clientX: 100, clientY: 80 }]);
  await touch(area, 'touchend', [{ clientX: 50, clientY: 80 }]);
  expect(area.querySelector('img')?.getAttribute('alt')).toBe('Account rasmi 2');
});
