// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatScroll } from './use-chat-scroll';

describe('chat scroll position', () => {
  let container: HTMLDivElement;
  let root: Root;
  let scroll: ReturnType<typeof useChatScroll>;
  let resize: () => void;
  let height = 400;
  const disconnect = vi.fn();

  function Harness({ lastId }: { lastId: string }) {
    scroll = useChatScroll(lastId);
    return createElement('div', { ref: scroll.listRef, onScroll: scroll.onScroll });
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    height = 400;
    disconnect.mockClear();
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => height);
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resize = callback; }
      observe() {}
      disconnect = disconnect;
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function render(lastId: string) {
    await act(async () => root.render(createElement(Harness, { lastId })));
    return container.firstElementChild as HTMLDivElement;
  }

  it('opens at the newest message and keeps it visible when the keyboard resizes the list', async () => {
    const list = await render('one');
    expect(list.scrollTop).toBe(1000);
    list.scrollTop = 600;
    height = 200;
    await act(async () => {
      // Browsers can dispatch scroll during reflow, before ResizeObserver runs.
      list.dispatchEvent(new Event('scroll'));
      resize();
    });
    expect(list.scrollTop).toBe(1000);
  });

  it('keeps older messages in place on incoming messages and viewport changes', async () => {
    const list = await render('one');
    await act(async () => {
      list.scrollTop = 150;
      list.dispatchEvent(new Event('scroll'));
    });
    await render('two');
    await act(async () => resize());
    expect(list.scrollTop).toBe(150);
    expect(scroll!.hasNewMessages).toBe(true);
    await act(async () => scroll!.scrollToBottom());
    expect(list.scrollTop).toBe(1000);
    expect(scroll!.hasNewMessages).toBe(false);
  });

  it('follows an outgoing message even when reading earlier messages', async () => {
    const list = await render('one');
    await act(async () => {
      list.scrollTop = 0;
      list.dispatchEvent(new Event('scroll'));
      scroll!.followNextMessage();
    });
    await render('mine');
    expect(list.scrollTop).toBe(1000);
  });

  it('follows after sending when polling already delivered the same message', async () => {
    const list = await render('one');
    await act(async () => {
      list.scrollTop = 100;
      list.dispatchEvent(new Event('scroll'));
    });
    await render('already-delivered');
    expect(list.scrollTop).toBe(100);
    await act(async () => scroll!.followNextMessage());
    expect(list.scrollTop).toBe(1000);
    expect(scroll!.hasNewMessages).toBe(false);
  });
});
