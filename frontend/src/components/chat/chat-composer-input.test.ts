// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatComposerInput } from './chat-composer-input';

describe('chat composer input', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onSend = vi.fn();
  let contentHeight = 42;
  let mobile = false;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    mobile = false;
    contentHeight = 42;
    onSend.mockClear();
    vi.stubGlobal('matchMedia', () => ({ matches: mobile }));
    vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(() => contentHeight);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function render(value = '') {
    await act(async () => root.render(createElement(ChatComposerInput, { value, onChange: vi.fn(), onSend })));
    return container.querySelector('textarea')!;
  }

  it('starts with one line, grows with the draft, caps height, then shrinks after send', async () => {
    const input = await render();
    expect(input.rows).toBe(1);
    expect(input.style.height).toBe('44px');
    contentHeight = 86;
    await render('Line one\nLine two\nLine three');
    expect(input.style.height).toBe('88px');
    contentHeight = 300;
    await render('Long message');
    expect(input.style.height).toBe('128px');
    expect(input.style.overflowY).toBe('auto');
    contentHeight = 42;
    await render();
    expect(input.style.height).toBe('44px');
  });

  it('sends with Enter on desktop but keeps Shift+Enter as a newline', async () => {
    const input = await render('Salom');
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    await act(async () => { input.dispatchEvent(enter); });
    expect(onSend).toHaveBeenCalledOnce();
    expect(enter.defaultPrevented).toBe(true);
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })); });
    expect(onSend).toHaveBeenCalledOnce();
  });

  it('keeps mobile Return as a newline and never sends an IME composition', async () => {
    mobile = true;
    const input = await render('Salom');
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    await act(async () => { input.dispatchEvent(enter); });
    expect(enter.defaultPrevented).toBe(false);
    mobile = false;
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })); });
    expect(onSend).not.toHaveBeenCalled();
  });
});
