// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { MessageActionSheet } from './message-action-sheet';
it('ignores the opening finger release, then accepts a fresh press or keyboard click', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); const root = createRoot(host);
  const close = vi.fn(), reply = vi.fn();
  try {
    await act(async () => root.render(createElement(MessageActionSheet, { message: { id: 'm', chatId: 'c', senderId: 'other', content: 'Hi', createdAt: '' }, mine: false, onReply: reply, onCopy: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onClose: close })));
    const backdrop = host.querySelector('[role="dialog"]')!;
    const button = host.querySelector('button')!;
    await act(async () => backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));
    await act(async () => button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));
    expect(close).not.toHaveBeenCalled(); expect(reply).not.toHaveBeenCalled();
    await act(async () => backdrop.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    await act(async () => backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));
    expect(close).toHaveBeenCalledTimes(1);
    await act(async () => button.click());
    expect(reply).toHaveBeenCalledTimes(1);
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});
