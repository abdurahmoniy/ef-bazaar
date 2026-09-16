import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, it, expect, vi } from 'vitest';

function worker(userId: string | null = 'user-a') {
  const showNotification = vi.fn();
  const handlers: Record<string, (event: unknown) => void> = {};
  const self = {
    location: { origin: 'https://efbazaar.uz' },
    registration: { showNotification },
    clients: { matchAll: vi.fn().mockResolvedValue([]), openWindow: vi.fn() },
    addEventListener: (name: string, fn: (event: unknown) => void) => { handlers[name] = fn; },
  };
  const ctx = vm.createContext({ self, URL, fetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ userId }) }) });
  vm.runInContext(readFileSync('public/push-notifications.js', 'utf8'), ctx);
  return { self, handlers, ctx, showNotification };
}
const data = { recipientUserId: 'user-a', notificationId: 'n-1', title: 'eFBazaar', body: 'Yangi xabar', url: '/chats/chat-1' };
describe('background push', () => {
  it('shows a tagged notification linking to its chat', async () => {
    const w = worker();
    await vm.runInContext(`self.handleBackgroundPush(${JSON.stringify({ data })})`, w.ctx);
    expect(w.showNotification).toHaveBeenCalledWith('eFBazaar', expect.objectContaining({ tag: 'n-1', data: { url: 'https://efbazaar.uz/chats/chat-1', recipientUserId: 'user-a' } }));
  });
  it.each([null, 'user-b'])('does not display another account notification for %s', async (userId) => {
    const w = worker(userId);
    await vm.runInContext(`self.handleBackgroundPush(${JSON.stringify({ data })})`, w.ctx);
    expect(w.showNotification).not.toHaveBeenCalled();
  });
  it.each(['https://evil.example/', '//evil.example/', 'javascript:alert(1)', '/api/auth'])('rejects unsafe destinations: %s', async (url) => {
    const w = worker();
    await vm.runInContext(`self.handleBackgroundPush(${JSON.stringify({ data: { ...data, url } })})`, w.ctx);
    expect(w.showNotification).toHaveBeenCalledWith('eFBazaar', expect.objectContaining({ data: expect.objectContaining({ url: 'https://efbazaar.uz/notifications' }) }));
  });
});
