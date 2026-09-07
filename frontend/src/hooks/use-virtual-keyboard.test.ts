// @vitest-environment jsdom

import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVirtualKeyboard } from './use-virtual-keyboard';

const reactActGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

describe('useVirtualKeyboard', () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: boolean = false;
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  function Harness() {
    latest = useVirtualKeyboard();
    return React.createElement('span', null, String(latest));
  }

  beforeEach(() => {
    reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    latest = false;
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
    Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 800 });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: originalInnerWidth });
    Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: originalInnerHeight });
    vi.restoreAllMocks();
  });

  it('starts false when no input is focused', async () => {
    await act(async () => {
      root.render(React.createElement(Harness));
    });
    expect(latest).toBe(false);
  });

  it('detects keyboard open on focusin of a text input on mobile touch', async () => {
    await act(async () => {
      root.render(React.createElement(Harness));
    });

    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);

    await act(async () => {
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });

    expect(latest).toBe(true);
    document.body.removeChild(input);
  });

  it('ignores focusin of checkbox inputs', async () => {
    await act(async () => {
      root.render(React.createElement(Harness));
    });

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    document.body.appendChild(checkbox);

    await act(async () => {
      checkbox.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });

    expect(latest).toBe(false);
    document.body.removeChild(checkbox);
  });

  it('does not activate keyboard on desktop screen widths', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });

    await act(async () => {
      root.render(React.createElement(Harness));
    });

    const input = document.createElement('input');
    document.body.appendChild(input);

    await act(async () => {
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });

    expect(latest).toBe(false);
    document.body.removeChild(input);
  });

  it('resets keyboard to false on focusout after timer', async () => {
    vi.useFakeTimers();

    await act(async () => {
      root.render(React.createElement(Harness));
    });

    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);

    await act(async () => {
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });
    expect(latest).toBe(true);

    await act(async () => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      vi.advanceTimersByTime(150);
    });

    expect(latest).toBe(false);
    document.body.removeChild(input);
    vi.useRealTimers();
  });
});
