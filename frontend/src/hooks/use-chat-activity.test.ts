// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useChatActivity, type ChatActivity } from './use-chat-activity';

const socket = vi.hoisted(() => ({ request: vi.fn(async () => null), watch: vi.fn() }));
vi.mock('@/lib/chat-socket', () => ({ getChatSocket: () => socket }));
let root: Root;
let state: ReturnType<typeof useChatActivity>;
let publish: (activity: ChatActivity | null) => void;
let hidden = false;
function Probe() { state = useChatActivity('chat', 'viewer'); return null; }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers(); hidden = false; socket.request.mockClear();
  socket.watch.mockImplementation((_chat, listener) => { publish = listener; return () => {}; });
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => hidden ? 'hidden' : 'visible');
  root = createRoot(document.createElement('div'));
});
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); vi.restoreAllMocks(); });
const mount = async () => act(async () => root.render(createElement(Probe)));
it('receives partner activity over the socket and retains confirmed reads when disconnected', async () => {
  await mount();
  await act(async () => publish({ online: true, typing: true, lastSeenAt: null, lastReadAt: '2026-09-24T09:00:00Z' }));
  expect(state.activity?.online).toBe(true); expect(state.lastReadAt).toBe('2026-09-24T09:00:00Z');
  await act(async () => publish(null));
  expect(state.activity).toBeNull(); expect(state.lastReadAt).toBe('2026-09-24T09:00:00Z');
});
it('never polls activity and only sends typing from input, throttled and stopped after inactivity', async () => {
  await mount(); await act(async () => vi.advanceTimersByTimeAsync(60000)); expect(socket.request).not.toHaveBeenCalled();
  await act(async () => { state.setTyping(true); state.setTyping(true); });
  expect(socket.request).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  await act(async () => state.setTyping(true)); expect(socket.request).toHaveBeenCalledTimes(2);
  await act(async () => vi.advanceTimersByTimeAsync(4000));
  expect(socket.request).toHaveBeenLastCalledWith('typing', 'chat', { typing: false });
});
it('clears typing when the page hides', async () => {
  await mount(); await act(async () => state.setTyping(true)); hidden = true;
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(socket.request).toHaveBeenLastCalledWith('typing', 'chat', { typing: false });
});
