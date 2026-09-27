// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VideoPlayerModal } from './video-player-modal';
import type { Guide } from '@/lib/guides';

let container: HTMLDivElement;
let root: Root;
const guide: Guide = {
  id: 'first', title: 'First guide', description: 'How to start',
  videoFileId: 'first-video', createdAt: '2026-09-25',
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function render(selected: Guide | null) {
  await act(async () => root.render(createElement(VideoPlayerModal, {
    guide: selected, category: 'start', onClose: vi.fn(),
  })));
}

async function failVideo() {
  // The old player tried three endpoints before showing the error.
  for (let attempt = 0; attempt < 3 && container.querySelector('video'); attempt++) {
    await act(async () => container.querySelector('video')?.dispatchEvent(new Event('error')));
  }
  expect(container.querySelector('video')).toBeNull();
}

it('starts a different guide after the previous guide failed', async () => {
  await render(guide);
  await failVideo();
  await render({ ...guide, id: 'second', videoFileId: 'second-video' });
  expect(container.querySelector('video')?.getAttribute('src')).toBe('/api/video/second-video');
});

it('reopens a failed guide with a fresh player', async () => {
  await render(guide);
  await failVideo();
  await render(null);
  expect(document.body.style.overflow).toBe('');
  await render(guide);
  expect(container.querySelector('video')?.getAttribute('src')).toBe('/api/video/first-video');
});

it('offers retry without inventing a file size diagnosis', async () => {
  await render(guide);
  await failVideo();
  expect(container.textContent).not.toContain('Video hajmi katta');
  const retry = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('Qayta urinish'));
  await act(async () => retry?.click());
  expect(container.querySelector('video')?.getAttribute('src')).toBe('/api/video/first-video');
});
