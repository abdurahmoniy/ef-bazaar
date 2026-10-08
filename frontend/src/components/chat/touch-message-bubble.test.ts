// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TouchMessageBubble } from './touch-message-bubble';
let host: HTMLDivElement;
let root: Root;
const reply = vi.fn(), actions = vi.fn(), photo = vi.fn();
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers(); vi.clearAllMocks();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(TouchMessageBubble, { role: 'button', onReply: reply, onActions: actions },
    createElement('span', null, 'Hello'),
    createElement('button', { 'aria-label': 'Rasmni kattalashtirish', onClick: photo }, 'Photo'),
    createElement('button', { 'aria-label': 'Play voice', onClick: photo }, 'Play'))));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function touch(type: string, points: number[][], target: Element = host.firstElementChild!) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : points.map(([clientX, clientY]) => ({ clientX, clientY })) });
  await act(async () => { target.dispatchEvent(event); });
}
it.each(['touchcancel', 'vertical', 'multitouch', 'left'])('cancels actions and replying for %s', async mode => {
  await touch('touchstart', [[50, 50]]);
  if (mode === 'touchcancel') await touch('touchcancel', []);
  if (mode === 'vertical') await touch('touchmove', [[60, 160]]);
  if (mode === 'multitouch') await touch('touchstart', [[50, 50], [100, 100]]);
  if (mode === 'left') await touch('touchmove', [[-50, 55]]);
  await act(async () => vi.advanceTimersByTime(600));
  await touch('touchend', []);
  expect(reply).not.toHaveBeenCalled(); expect(actions).not.toHaveBeenCalled();
});
it('allows an ordinary image tap but suppresses the click after swiping it', async () => {
  const target = host.querySelector<HTMLButtonElement>('[aria-label="Rasmni kattalashtirish"]')!;
  await touch('touchstart', [[40, 50]], target); await touch('touchend', [], target);
  await act(async () => target.click());
  expect(photo).toHaveBeenCalledTimes(1); expect(actions).not.toHaveBeenCalled();
  await touch('touchstart', [[40, 50]], target); await touch('touchmove', [[120, 50]], target); await touch('touchend', [], target);
  await act(async () => target.click());
  expect(photo).toHaveBeenCalledTimes(1); expect(reply).toHaveBeenCalledTimes(1);
});
it('does not hijack a held media playback control', async () => {
  const target = host.querySelector<HTMLButtonElement>('[aria-label="Play voice"]')!;
  await touch('touchstart', [[50, 50]], target);
  await act(async () => vi.advanceTimersByTime(600));
  await touch('touchend', [], target); await act(async () => target.click());
  expect(photo).toHaveBeenCalledTimes(1); expect(actions).not.toHaveBeenCalled();
});
it('clears a pending hold when the message unmounts', async () => {
  await touch('touchstart', [[50, 50]]);
  await act(async () => root.render(null));
  await act(async () => vi.advanceTimersByTime(600));
  expect(actions).not.toHaveBeenCalled();
});
