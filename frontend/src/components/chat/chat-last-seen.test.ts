// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChatActivityStatus } from './chat-activity-status';
import type { ChatActivity } from '@/hooks/use-chat-activity';

let root: Root;
let container: HTMLDivElement;
const offline: ChatActivity = { online: false, typing: false, lastSeenAt: '2026-09-25T09:59:40Z', lastReadAt: null };
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-25T10:00:00Z'));
  container = document.createElement('div'); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); vi.restoreAllMocks(); });
const render = async (activity: ChatActivity | null) => act(async () => root.render(createElement(ChatActivityStatus, { activity })));

it('shows last seen as visible text, updates with time, and cleans up its timer', async () => {
  await render(offline);
  expect(container.textContent).toBe('Oxirgi faollik: hozirgina');
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(container.textContent).toBe('Oxirgi faollik: 1 daqiqa oldin');
  await act(async () => root.unmount());
  expect(vi.getTimerCount()).toBe(0);
  root = createRoot(container);
});
it('prioritizes typing and online over last seen, and keeps disconnected state unknown', async () => {
  await render({ ...offline, online: true });
  expect(container.textContent).toBe('Onlayn');
  await render({ ...offline, online: true, typing: true });
  expect(container.textContent).toContain('yozmoqda');
  await render(null);
  expect(container.textContent).toBe('Savdo suhbati');
  expect(vi.getTimerCount()).toBe(0);
});
it.each([null, 'invalid'])('does not invent a last seen time for %s', async lastSeenAt => {
  await render({ ...offline, lastSeenAt });
  expect(container.textContent).toBe('Oflayn');
});
it('refreshes elapsed time after returning to the tab', async () => {
  await render(offline);
  vi.setSystemTime(new Date('2026-09-25T10:05:00Z'));
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(container.textContent).toBe('Oxirgi faollik: 5 daqiqa oldin');
});
it('uses the current time when an online partner goes offline much later', async () => {
  await render({ ...offline, online: true });
  vi.setSystemTime(new Date('2026-09-25T12:00:00Z'));
  await render({ ...offline, lastSeenAt: '2026-09-25T11:55:00Z' });
  expect(container.textContent).toBe('Oxirgi faollik: 5 daqiqa oldin');
});
