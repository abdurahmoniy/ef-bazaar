// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useChatActivity, usePresenceHeartbeat } from './use-chat-activity';

let root: Root;
let state: ReturnType<typeof useChatActivity>;
let hidden = false;
let online = true;
let status = 200;
function Probe() { state = useChatActivity('chat'); usePresenceHeartbeat('viewer'); return null; }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers(); hidden = false; online = true; status = 200;
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => hidden ? 'hidden' : 'visible');
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  vi.stubGlobal('fetch', vi.fn(async (input: string) => String(input).endsWith('/activity')
    ? status === 200 ? Response.json({ online: true, typing: true, lastSeenAt: '2026-09-24T10:00:00Z', lastReadAt: '2026-09-24T09:00:00Z' }) : new Response(null, { status })
    : new Response(null, { status: 204 })));
  root = createRoot(document.createElement('div'));
});
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const mount = async () => act(async () => root.render(createElement(Probe)));
const posts = () => vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/typing'));
it('loads actual partner activity and retains confirmed read receipts during an outage', async () => {
  await mount(); expect(state.activity?.online).toBe(true); expect(state.lastReadAt).toBe('2026-09-24T09:00:00Z');
  status = 503;
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(state.activity).toBeNull(); expect(state.lastReadAt).toBe('2026-09-24T09:00:00Z');
});
it('pauses activity and heartbeat while hidden or offline, resuming on visibility', async () => {
  await mount(); vi.mocked(fetch).mockClear(); hidden = true;
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(45000); });
  expect(fetch).not.toHaveBeenCalled(); expect(state.activity).toBeNull();
  hidden = false; online = false;
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(15000); });
  expect(fetch).not.toHaveBeenCalled();
  online = true; await act(async () => window.dispatchEvent(new Event('online')));
  expect(state.activity?.online).toBe(true);
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith('/presence'))).toBe(true);
});
it('only publishes typing from input, throttles keystrokes, and stops after inactivity', async () => {
  await mount(); expect(posts()).toHaveLength(0);
  await act(async () => { state.setTyping(true); state.setTyping(true); });
  expect(posts()).toHaveLength(1);
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  await act(async () => state.setTyping(true)); expect(posts()).toHaveLength(2);
  await act(async () => vi.advanceTimersByTimeAsync(4000));
  expect(JSON.parse(String(posts().at(-1)?.[1]?.body))).toEqual({ typing: false });
});
it('clears typing when the page hides', async () => {
  await mount(); await act(async () => state.setTyping(true)); hidden = true;
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(JSON.parse(String(posts().at(-1)?.[1]?.body))).toEqual({ typing: false });
});
