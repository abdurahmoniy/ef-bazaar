// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AdminGuides } from './admin-guides';

vi.mock('@/lib/guides', async (original) => ({
  ...await original<typeof import('@/lib/guides')>(),
  listGuides: vi.fn().mockResolvedValue([]),
}));

let container: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(AdminGuides)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function selectVideo(size: number) {
  const input = container.querySelector<HTMLInputElement>('#guide-video')!;
  const file = new File(['video'], 'guide.mp4', { type: 'video/mp4' });
  Object.defineProperty(file, 'size', { value: size });
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}

it('rejects a video above the web playback limit before uploading, and clears the error for an allowed file', async () => {
  await selectVideo(20 * 1024 * 1024 + 1);
  expect(container.textContent).toContain('Video 20.0 MB');
  expect(container.textContent).toContain('20 MB dan oshmasligi kerak');
  expect(container.textContent).not.toContain('50 MB');
  await selectVideo(20 * 1024 * 1024);
  expect(container.textContent).not.toContain('Video 20.0 MB');
});
