// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useChatKeyboardHeight } from './use-chat-keyboard-height';

it('remembers real keyboard height across blur and ignores toolbar, zoom, and rotation changes', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0, scale: 1 });
  vi.stubGlobal('visualViewport', viewport); vi.stubGlobal('innerHeight', 800); vi.stubGlobal('innerWidth', 390);
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  function Harness() { return createElement('output', null, useChatKeyboardHeight()); }
  try {
    await act(async () => root.render(createElement(Harness)));
    expect(container.textContent).toBe('280');
    await act(async () => { viewport.height = 760; viewport.dispatchEvent(new Event('resize')); });
    expect(container.textContent).toBe('280');
    await act(async () => { viewport.height = 490; viewport.dispatchEvent(new Event('resize')); });
    expect(container.textContent).toBe('310');
    await act(async () => { viewport.height = 800; viewport.dispatchEvent(new Event('resize')); });
    expect(container.textContent).toBe('310');
    await act(async () => { viewport.scale = 2; viewport.height = 200; viewport.dispatchEvent(new Event('resize')); });
    expect(container.textContent).toBe('310');
    await act(async () => { viewport.scale = 1; viewport.height = 390; vi.stubGlobal('innerHeight', 390); vi.stubGlobal('innerWidth', 800); window.dispatchEvent(new Event('resize')); });
    expect(container.textContent).toBe('280');
  } finally {
    await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  }
});
