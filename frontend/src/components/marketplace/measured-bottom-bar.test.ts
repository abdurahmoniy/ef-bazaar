// @vitest-environment jsdom

import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MeasuredBottomBar } from './measured-bottom-bar';

const reactActGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

describe('MeasuredBottomBar keyboard behavior', () => {
  let container: HTMLDivElement;
  let root: Root;
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  beforeEach(() => {
    reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
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

  it('slides down and hides on mobile when keyboard opens with hideOnKeyboard=true', async () => {
    await act(async () => {
      root.render(
        React.createElement(
          'div',
          { 'data-marketplace-shell': true },
          React.createElement(
            MeasuredBottomBar,
            { hideOnKeyboard: true, className: 'test-bar' },
            React.createElement('button', null, 'Action'),
          ),
        ),
      );
    });

    const bar = container.querySelector('.test-bar');
    expect(bar).not.toBeNull();
    expect(bar?.classList.contains('max-sm:translate-y-full')).toBe(false);

    // Simulate input focus on mobile
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);

    await act(async () => {
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });

    expect(bar?.classList.contains('max-sm:translate-y-full')).toBe(true);
    expect(bar?.getAttribute('data-keyboard-hidden')).toBe('true');

    document.body.removeChild(input);
  });

  it('does not hide when hideOnKeyboard is false', async () => {
    await act(async () => {
      root.render(
        React.createElement(
          'div',
          { 'data-marketplace-shell': true },
          React.createElement(
            MeasuredBottomBar,
            { hideOnKeyboard: false, className: 'static-bar' },
            React.createElement('button', null, 'Action'),
          ),
        ),
      );
    });

    const bar = container.querySelector('.static-bar');
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);

    await act(async () => {
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });

    expect(bar?.classList.contains('max-sm:translate-y-full')).toBe(false);
    expect(bar?.hasAttribute('data-keyboard-hidden')).toBe(false);

    document.body.removeChild(input);
  });
});
