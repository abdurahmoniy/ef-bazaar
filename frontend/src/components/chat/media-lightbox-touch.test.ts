// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MediaLightbox } from './media-lightbox';
let host: HTMLDivElement, root: Root;
const close = vi.fn(), next = vi.fn(), prev = vi.fn();
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.clearAllMocks();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(MediaLightbox, { src: '/image', alt: 'Image', onClose: close, onNext: next, onPrev: prev, hasNext: true, hasPrev: true })));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function touch(type: string, points: number[][]) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : points.map(([clientX, clientY]) => ({ clientX, clientY })) });
  Object.defineProperty(event, 'changedTouches', { value: points.map(([clientX, clientY]) => ({ clientX, clientY })) });
  await act(async () => { host.querySelector('img')!.parentElement!.dispatchEvent(event); });
}
it('ignores navigation and dismissal while zoomed and preserves pinch scale', async () => {
  await touch('touchstart', [[100, 100], [200, 100]]);
  await touch('touchmove', [[50, 100], [250, 100]]);
  await touch('touchend', [[50, 100], [250, 100]]);
  expect(host.querySelector('img')!.style.transform).toContain('scale(2)');
  await touch('touchstart', [[200, 100]]); await touch('touchmove', [[40, 100]]); await touch('touchend', [[40, 100]]);
  await touch('touchstart', [[100, 100]]); await touch('touchmove', [[100, 240]]); await touch('touchend', [[100, 240]]);
  expect(next).not.toHaveBeenCalled(); expect(prev).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
});
it('does not navigate after a cancelled gesture or a pinch', async () => {
  await touch('touchstart', [[200, 100]]); await touch('touchcancel', []); await touch('touchend', [[40, 100]]);
  await touch('touchstart', [[100, 100], [200, 100]]); await touch('touchend', [[40, 100]]);
  expect(next).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
});
it('keeps double tap zoom when the browser emits a synthetic click', async () => {
  for (let i = 0; i < 2; i++) {
    await touch('touchstart', [[100, 100]]); await touch('touchend', [[100, 100]]);
    await act(async () => host.querySelector('img')!.click());
    if (i === 0) expect(host.querySelector('img')!.style.transform).toContain('scale(1)');
  }
  expect(host.querySelector('img')!.style.transform).toContain('scale(2.5)');
});
