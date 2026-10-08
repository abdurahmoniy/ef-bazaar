// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChatEmojiPicker } from './chat-emoji-picker';

const item = { customEmojiId: '123', emoji: '😊', format: 'static', thumbnailUrl: '/thumb', fileUrl: '/emoji' };
const packs = [{ id: 'football', title: 'Football', setName: 'Football', items: [item] }];
let container: HTMLDivElement;
let root: Root;
const onPick = vi.fn(), onClose = vi.fn(), onBackspace = vi.fn();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear(); onPick.mockClear(); onClose.mockClear(); onBackspace.mockClear();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.useRealTimers();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});
async function render(disabled = false) {
  await act(async () => root.render(createElement(ChatEmojiPicker, { packs, loading: false, error: null, onPick, onClose, onBackspace, disabled, height: 300 })));
}
const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const pointer = (type: string) => Object.assign(new Event(type, { bubbles: true, cancelable: true }), { button: 0, pointerId: 1 });

it('keeps keyboard focus off by default, remembers picks, and opens search only on demand', async () => {
  await render(); expect(container.querySelector('input')).toBeNull();
  await act(async () => container.querySelector<HTMLButtonElement>('[data-emoji-id="123"]')!.click());
  expect(onPick).toHaveBeenCalledWith(item); expect(onClose).not.toHaveBeenCalled();
  await act(async () => button('Yaqinda ishlatilganlar').click());
  expect(container.querySelector('[data-emoji-id="123"]')).not.toBeNull();
  await act(async () => button('Emoji qidirish').click());
  const input = container.querySelector('input')!;
  expect(document.activeElement).toBe(input);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'missing');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(container.textContent).toContain('Emoji topilmadi');
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(container.querySelector('input')).toBeNull(); expect(onClose).not.toHaveBeenCalled();
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(onClose).toHaveBeenCalledOnce();
});

it('backspace taps once, repeats on hold, and stops after release, cancellation, or disabling', async () => {
  vi.useFakeTimers(); await render(); const erase = button('Belgini o‘chirish');
  await act(async () => {
    erase.dispatchEvent(pointer('pointerdown'));
    erase.dispatchEvent(pointer('pointerup'));
    // Touch-generated clicks can also have detail zero on mobile browsers.
    erase.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
  });
  expect(onBackspace).toHaveBeenCalledOnce();
  await act(async () => { erase.dispatchEvent(pointer('pointerdown')); vi.advanceTimersByTime(560); });
  expect(onBackspace).toHaveBeenCalledTimes(5);
  await act(async () => { erase.dispatchEvent(pointer('pointercancel')); vi.advanceTimersByTime(1000); });
  expect(onBackspace).toHaveBeenCalledTimes(5);
  await act(async () => erase.dispatchEvent(pointer('pointerdown')));
  await render(true);
  await act(async () => vi.advanceTimersByTime(1000));
  expect(onBackspace).toHaveBeenCalledTimes(6);
  expect(erase.disabled).toBe(true);
});
