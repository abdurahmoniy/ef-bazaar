// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageResponse } from '@/lib/marketplace-types';
import { ChatSearch } from './chat-search';

describe('chat history search', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onJump = vi.fn();
  const onClose = vi.fn();
  const messages: MessageResponse[] = [
    { id: 'old', chatId: 'chat', senderId: 'peer', content: 'SALOM [dunyo]', createdAt: '2026-01-01' },
    { id: 'file', chatId: 'chat', senderId: 'peer', content: '', attachmentName: 'salom.pdf', createdAt: '2026-01-02' },
    { id: 'new', chatId: 'chat', senderId: 'me', content: 'Xayr', createdAt: '2026-01-03' },
  ];

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    onJump.mockReset();
    onClose.mockReset();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function render(extra: Partial<Parameters<typeof ChatSearch>[0]> = {}) {
    await act(async () => root.render(createElement(ChatSearch, { messages, onJump, onClose, ...extra })));
    return container.querySelector('input')!;
  }

  async function search(value: string) {
    const input = container.querySelector('input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return input;
  }

  it('focuses the search and finds older text and attachment names ignoring case', async () => {
    const input = await render();
    expect(document.activeElement).toBe(input);
    expect(onJump).not.toHaveBeenCalled();
    await search(' sAlOm ');
    expect(container.textContent).toContain('1 / 2');
    expect(onJump).toHaveBeenLastCalledWith('old');
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(container.textContent).toContain('2 / 2');
    expect(onJump).toHaveBeenLastCalledWith('file');
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })));
    expect(onJump).toHaveBeenLastCalledWith('old');
  });

  it('supports wrapping previous/next controls and Escape from the search region', async () => {
    await render();
    await search('salom');
    const previous = container.querySelector<HTMLButtonElement>('button[aria-label="Oldingi natija"]')!;
    const next = container.querySelector<HTMLButtonElement>('button[aria-label="Keyingi natija"]')!;
    await act(async () => previous.click());
    expect(onJump).toHaveBeenLastCalledWith('file');
    await act(async () => next.click());
    expect(onJump).toHaveBeenLastCalledWith('old');
    await act(async () => next.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('treats metacharacters literally and reports empty results without jumping', async () => {
    await render();
    await search('[dunyo]');
    expect(container.textContent).toContain('1 / 1');
    onJump.mockClear();
    await search('.*');
    expect(container.textContent).toContain('Natija topilmadi');
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Keyingi natija"]')!.disabled).toBe(true);
    expect(onJump).not.toHaveBeenCalled();
    await search('   ');
    expect(container.textContent).not.toContain('Natija topilmadi');
    expect(onJump).not.toHaveBeenCalled();
  });

  it('updates the selected result when a matching message disappears', async () => {
    await render();
    await search('salom');
    await render({ messages: messages.slice(1) });
    expect(container.textContent).toContain('1 / 1');
    expect(onJump).toHaveBeenLastCalledWith('file');
  });

  it('shows loading and history errors instead of a misleading empty result', async () => {
    await render({ messages: [], loading: true });
    await search('salom');
    expect(container.textContent).toContain('Yuklanmoqda');
    expect(container.textContent).not.toContain('Natija topilmadi');
    await render({ messages: [], error: 'Tarixni yuklab bo‘lmadi' });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Tarixni yuklab bo‘lmadi');
    expect(container.textContent).not.toContain('Natija topilmadi');
  });
});
