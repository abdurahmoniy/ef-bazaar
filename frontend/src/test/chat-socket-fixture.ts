/** Presentation-test adapter for existing endpoint fixtures. Transport behavior is
 * tested independently with real protocol frames in chat-socket.test.ts. */
import type { ChatActivity } from '@/hooks/use-chat-activity';
import type { ChatSocketEvent } from '@/lib/chat-socket';
const listeners = new Set<(event: ChatSocketEvent) => void>();
export const emitChatEvent = (event: ChatSocketEvent) => listeners.forEach(listener => listener(event));
export const socketFixture = {
  connected: true,
  async request(type: string, chatId?: string, payload?: Record<string, unknown>, signal?: AbortSignal) {
    const base = '/api/marketplace/v1/chats';
    const paths: Record<string, string> = { inbox: '/me', unread: '/unread-total', get: `/${chatId}`, messages: `/${chatId}/messages?size=200&sort=createdAt,asc`,
      send: `/${chatId}/messages`, edit: `/${chatId}/messages/${payload?.messageId}`, delete: `/${chatId}/messages/${payload?.messageId}`,
      watch: `/${chatId}/activity` };
    const writes = ['send', 'edit', 'delete', 'read', 'typing', 'important', 'hide'];
    const method = type === 'edit' ? 'PATCH' : type === 'delete' ? 'DELETE' : writes.includes(type) ? 'POST' : undefined;
    const response = await fetch(base + (paths[type] ?? `/${chatId}/${type}`), { method, signal, body: payload ? JSON.stringify(payload) : undefined });
    if (!response.ok) {
      let message = 'Unavailable';
      try { const body = await response.json(); message = body.message ?? body.error ?? message; } catch {}
      const { ChatSocketError } = await import('@/lib/chat-socket');
      throw new ChatSocketError(response.status, message);
    }
    return response.status === 204 ? null : response.json();
  },
  subscribe(listener: (event: ChatSocketEvent) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  watch(chatId: string, listener: (activity: ChatActivity | null) => void) {
    let alive = true;
    void socketFixture.request('watch', chatId).then(value => { if (alive) listener(value); }).catch(() => { if (alive) listener(null); });
    return () => { alive = false; };
  },
};
