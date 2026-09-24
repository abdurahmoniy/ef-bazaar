// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChatSocket, ChatSocketError, getChatSocket, closeOtherChatSockets } from './chat-socket';

class Socket {
  static instances: Socket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  sent: { id: string; type: string; chatId?: string; payload?: unknown }[] = [];
  constructor(readonly url: string) { Socket.instances.push(this); }
  send(text: string) { this.sent.push(JSON.parse(text)); }
  open() { this.readyState = 1; this.onopen?.(); }
  close() { this.readyState = 3; this.onclose?.(); }
  receive(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
  reply(type: string, payload: unknown) { this.receive({ id: this.sent.findLast(message => message.type === type)!.id, type: 'result', payload }); }
}
let client: ChatSocket;
beforeEach(() => {
  vi.useFakeTimers(); Socket.instances = []; vi.stubGlobal('WebSocket', Socket);
  vi.spyOn(Math, 'random').mockReturnValue(0);
  client = new ChatSocket();
});
afterEach(() => { client.close(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('uses one same-origin socket, correlates concurrent results and rejects server errors', async () => {
  const first = client.request('inbox'); const second = client.request('send', 'chat', { content: 'hi' });
  expect(Socket.instances).toHaveLength(1);
  const ws = Socket.instances[0]; expect(ws.url).toMatch(/^ws:\/\/localhost(?::\d+)?\/ws\/chat$/);
  ws.open(); await Promise.resolve();
  ws.reply('send', { id: 'message' }); ws.reply('inbox', []);
  expect(await first).toEqual([]); expect(await second).toEqual({ id: 'message' });
  const forbidden = client.request('watch', 'other'); await Promise.resolve();
  ws.receive({ id: ws.sent.at(-1)!.id, type: 'error', status: 403, message: 'Forbidden' });
  await expect(forbidden).rejects.toMatchObject({ status: 403 });
});
it('rejects uncertain writes on disconnect without replaying and restores watches after reconnect', async () => {
  const activities = vi.fn(); client.watch('chat', activities);
  const first = Socket.instances[0]; first.open(); await Promise.resolve(); first.reply('watch', { online: true });
  await Promise.resolve();
  const pending = client.request('send', 'chat', { content: 'once' }); const failed = expect(pending).rejects.toBeInstanceOf(ChatSocketError);
  await Promise.resolve(); first.close(); await failed;
  expect(activities).toHaveBeenLastCalledWith(null);
  await vi.advanceTimersByTimeAsync(1000); const second = Socket.instances[1]; second.open(); await Promise.resolve();
  expect(second.sent.some(message => message.type === 'watch')).toBe(true);
  expect(second.sent.some(message => message.type === 'send')).toBe(false);
});
it('stops reconnecting and clears pending requests when the account is disposed', async () => {
  const result = client.request('inbox'); const failed = expect(result).rejects.toBeInstanceOf(ChatSocketError);
  client.close(); await failed; await vi.advanceTimersByTimeAsync(60000);
  expect(Socket.instances).toHaveLength(1);
});
it('times out a dead connection and cancels obsolete snapshot requests', async () => {
  const controller = new AbortController(); const request = client.request('messages', 'chat', {}, controller.signal);
  const failed = expect(request).rejects.toMatchObject({ name: 'AbortError' }); controller.abort(); await failed;
  const timeout = client.request('inbox'); const timeoutFailure = expect(timeout).rejects.toBeInstanceOf(ChatSocketError);
  await vi.advanceTimersByTimeAsync(12000); await timeoutFailure;
});
it('pushes activity only to registered chats, and reports connection lifecycle for cache recovery', async () => {
  const listener = vi.fn(); const activity = vi.fn(); client.subscribe(listener); const unwatch = client.watch('chat', activity);
  const ws = Socket.instances[0]; ws.open(); await Promise.resolve();
  ws.receive({ type: 'activity', chatId: 'chat', payload: { online: true, typing: true } });
  expect(activity).toHaveBeenLastCalledWith({ online: true, typing: true });
  expect(listener).toHaveBeenCalledWith({ type: 'connected' });
  unwatch(); ws.receive({ type: 'activity', chatId: 'chat', payload: { online: false } });
  expect(activity).toHaveBeenLastCalledWith({ online: true, typing: true });
});

it('fences late work from the previous account and creates a fresh connection when switching back', async () => {
  closeOtherChatSockets('alice');
  const alice = getChatSocket('alice'); const unsubscribe = alice.subscribe(() => {});
  Socket.instances.at(-1)!.open();
  closeOtherChatSockets('bob');
  getChatSocket('bob').subscribe(() => {}); Socket.instances.at(-1)!.open();
  const count = Socket.instances.length;
  await expect(getChatSocket('alice').request('typing', 'chat', { typing: false })).rejects.toMatchObject({ status: 401 });
  expect(Socket.instances).toHaveLength(count);
  closeOtherChatSockets('alice');
  const nextAlice = getChatSocket('alice'); expect(nextAlice).not.toBe(alice);
  nextAlice.subscribe(() => {}); expect(Socket.instances).toHaveLength(count + 1);
  unsubscribe(); closeOtherChatSockets(null);
});
it('immediately shares the latest activity with a second subscriber to the same chat', async () => {
  const first = vi.fn(); client.watch('chat', first);
  const ws = Socket.instances[0]; ws.open(); await Promise.resolve();
  const activity = { online: true, typing: false, lastSeenAt: null, lastReadAt: null };
  ws.reply('watch', activity); await Promise.resolve();
  const second = vi.fn(); client.watch('chat', second);
  expect(second).toHaveBeenCalledWith(activity);
  expect(ws.sent.filter(message => message.type === 'watch')).toHaveLength(1);
});

it('restores authorized watches before sending typing queued while connecting', async () => {
  client.watch('chat', () => {});
  const typing = client.request('typing', 'chat', { typing: true });
  const ws = Socket.instances[0]; ws.open(); await Promise.resolve();
  expect(ws.sent.findIndex(message => message.type === 'watch')).toBeLessThan(ws.sent.findIndex(message => message.type === 'typing'));
  ws.reply('typing', null); await typing;
});
