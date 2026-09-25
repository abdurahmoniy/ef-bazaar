// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useChatOutbox } from './use-chat-outbox';
import type { MessageResponse } from '@/lib/marketplace-types';
const socket = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/chat-socket', () => ({ getChatSocket: () => socket, ChatSocketError: class extends Error {} }));
vi.mock('@/lib/chat-cache', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/chat-cache')>(), commitChatMessages: vi.fn(async () => {}) }));
let root: Root; let client: QueryClient; let box: ReturnType<typeof useChatOutbox>;
const acknowledged = (id: string): MessageResponse => ({ id: 'server-id', clientMessageId: id, chatId: 'chat', senderId: 'viewer', content: 'Hello', createdAt: new Date().toISOString() });
function Probe({ messages = [], viewerId = 'viewer' }: { messages?: MessageResponse[]; viewerId?: string }) { box = useChatOutbox(viewerId, 'chat', messages); return createElement('div', null, box.entries.map(entry => entry.content).join(',')); }
const render = async (messages: MessageResponse[] = [], viewerId = 'viewer') => act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Probe, { messages, viewerId }))));
beforeEach(() => {
 Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
 notifyManager.setScheduler(queueMicrotask);
 sessionStorage.clear(); socket.request.mockReset(); client = new QueryClient(); root = createRoot(document.createElement('div'));
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); notifyManager.setScheduler(callback => setTimeout(callback, 0)); vi.unstubAllGlobals(); });
it('shows pending immediately and retries a lost acknowledgement with the same message ID', async () => {
 let fail!: (reason: Error) => void;
 socket.request.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
 await render();
 await act(async () => { box.send({ content: 'Hello' }); });
 expect(box.entries).toHaveLength(1); expect(box.entries[0].status).toBe('sending');
 const id = box.entries[0].clientMessageId;
 await act(async () => fail(new Error('Disconnected')));
 expect(box.entries[0].status).toBe('failed');
 socket.request.mockResolvedValueOnce(acknowledged(id));
 await act(async () => { box.retry(id); box.retry(id); });
 expect(socket.request).toHaveBeenCalledTimes(2);
 expect(socket.request.mock.calls[0][2].clientMessageId).toBe(id);
 expect(socket.request.mock.calls[1][2].clientMessageId).toBe(id);
 expect(box.entries).toHaveLength(0);
});
it('reconciles a socket-delivered message before its send acknowledgement', async () => {
 socket.request.mockReturnValue(new Promise(() => {})); await render();
 await act(async () => box.send({ content: 'Hello' }));
 const id = box.entries[0].clientMessageId;
 await render([acknowledged(id)]);
 expect(box.entries).toHaveLength(0);
});
it('retains failed messages across navigation and isolates accounts', async () => {
 socket.request.mockRejectedValue(new Error('Offline')); await render();
 await act(async () => box.send({ content: 'Keep me' }));
 await render([], 'other'); expect(box.entries).toHaveLength(0);
 await render(); expect(box.entries[0].content).toBe('Keep me');
});
it('keeps attachment and reply metadata on retry and catches network failures', async () => {
 const upload = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockImplementationOnce(async (_url, init) => Response.json(acknowledged(init.body.get('clientMessageId'))));
 vi.stubGlobal('fetch', upload); await render();
 const file = new File(['voice'], 'note.ogg', { type: 'audio/ogg' });
 await act(async () => box.send({ content: 'Caption', file, voice: true, replyTo: acknowledged('original') }));
 const id = box.entries[0].clientMessageId; expect(box.entries[0].status).toBe('failed');
 await act(async () => box.retry(id));
 expect(upload).toHaveBeenCalledTimes(2);
 for (const [, init] of upload.mock.calls) {
  expect(init.body.get('clientMessageId')).toBe(id); expect(init.body.get('replyToId')).toBe('server-id');
  expect(init.body.get('voice')).toBe('true'); expect(init.body.get('file').name).toBe('note.ogg');
 }
 expect(box.entries).toHaveLength(0);
});
it('restores a failed text intent after reload without auto-sending or replacing its ID', async () => {
 socket.request.mockRejectedValue(new Error('Offline')); await render();
 await act(async () => box.send({ content: 'Saved retry' }));
 const id = box.entries[0].clientMessageId;
 await act(async () => root.unmount()); client.clear();
 client = new QueryClient(); root = createRoot(document.createElement('div')); await render();
 expect(box.entries[0].clientMessageId).toBe(id); expect(box.entries[0].status).toBe('failed');
 expect(socket.request).toHaveBeenCalledTimes(1);
});
it('does not restore a removed account cache when an upload finishes after logout', async () => {
 let finish!: (response: Response) => void;
 vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
 await render(); await act(async () => box.send({ content: '', file: new File(['x'], 'x.png') }));
 const id = box.entries[0].clientMessageId;
 await act(async () => client.removeQueries({ queryKey: ['private', 'viewer'] }));
 await render([], 'other');
 const { commitChatMessages } = await import('@/lib/chat-cache'); vi.mocked(commitChatMessages).mockClear();
 await act(async () => finish(Response.json(acknowledged(id))));
 expect(commitChatMessages).not.toHaveBeenCalled();
 expect(client.getQueryCache().findAll({ queryKey: ['private', 'viewer'] })).toHaveLength(0);
});
it('dismisses a failed intent from the cache and reload storage without resending', async () => {
 socket.request.mockRejectedValue(new Error('Message no longer available')); await render();
 await act(async () => box.send({ content: 'Cannot send' }));
 await act(async () => box.dismiss(box.entries[0].clientMessageId));
 expect(box.entries).toHaveLength(0); expect(socket.request).toHaveBeenCalledTimes(1);
 expect(sessionStorage.getItem('chat-outbox:viewer:chat')).toBeNull();
});
it('restores saved text after hydration without replacing server markup', async () => {
 await act(async () => root.unmount());
 const storage = sessionStorage;
 storage.setItem('chat-outbox:viewer:chat', JSON.stringify([{ clientMessageId: crypto.randomUUID(), content: 'Saved text', createdAt: new Date().toISOString(), status: 'failed' }]));
 vi.stubGlobal('sessionStorage', undefined);
 const serverClient = new QueryClient();
 const container = document.createElement('div');
 container.innerHTML = renderToString(createElement(QueryClientProvider, { client: serverClient }, createElement(Probe)));
 serverClient.clear();
 vi.stubGlobal('sessionStorage', storage);
 const onRecoverableError = vi.fn();
 await act(async () => { root = hydrateRoot(container, createElement(QueryClientProvider, { client }, createElement(Probe)), { onRecoverableError }); });
 expect(container.textContent).toBe('Saved text');
 expect(onRecoverableError).not.toHaveBeenCalled();
 expect(socket.request).not.toHaveBeenCalled();
});
