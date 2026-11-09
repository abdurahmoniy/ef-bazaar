// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContactShieldNoticeView } from './contact-shield-notice';

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('ContactShieldNoticeView', () => {
  it('tells the sender why the contact was hidden and offers the escrow', async () => {
    const onOpen = vi.fn();
    await act(async () => root.render(createElement(ContactShieldNoticeView, { mine: true, onOpenTrade: onOpen })));

    expect(container.textContent).toContain('kontakt yashirildi');
    const button = container.querySelector('button')!;
    expect(button.textContent).toContain('Garov orqali savdo');

    await act(async () => button.click());
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('warns the receiver that leaving the platform loses the protection', async () => {
    await act(async () => root.render(createElement(ContactShieldNoticeView, { mine: false, onOpenTrade: vi.fn() })));

    expect(container.textContent).toContain('tashqarida');
    expect(container.querySelector('[role="note"]')).not.toBeNull();
  });
});
