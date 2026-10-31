// @vitest-environment jsdom
import { act, createElement } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { VoicePlayer } from './voice-player';

it('shows voice duration when metadata loaded before hydration', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const component = createElement(VoicePlayer, { src: '/voice.webm', seed: 'voice', mine: false });
  const container = document.createElement('div');
  container.innerHTML = renderToString(component);
  document.body.append(container);
  const audio = container.querySelector('audio')!;
  Object.defineProperty(audio, 'duration', { value: 10 });
  audio.pause = vi.fn();
  audio.dispatchEvent(new Event('loadedmetadata'));
  let root: Root | undefined;
  try {
    await act(async () => { root = hydrateRoot(container, component); });
    expect(container.textContent).toContain('0:10');
  } finally {
    await act(async () => root?.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
