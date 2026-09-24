'use client';

import type { ChatActivity } from '@/hooks/use-chat-activity';

export class ChatSocketError extends Error {
  constructor(readonly status: number, message = 'Chat aloqasi uzildi. Qayta urinib ko‘ring.') { super(message); }
  get permanent() { return this.status >= 400 && this.status < 500 && this.status !== 408 && this.status !== 429; }
}
export type ChatSocketEvent = { type: 'connected' } | { type: 'disconnected' } | { type: 'changed'; chatId: string };
type Pending = { send: () => void; reject: (error: Error) => void; resolve: (value: unknown) => void };
type ActivityListener = (activity: ChatActivity | null) => void;

/** One authenticated, cookie-backed connection per browser account. No drafts or tokens in the URL. */
export class ChatSocket {
  constructor(private readonly authorized: () => boolean = () => true) {}
  private socket: WebSocket | null = null;
  private disposed = false;
  private attempt = 0;
  private sequence = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private openingTimer?: ReturnType<typeof setTimeout>;
  private pending = new Map<string, Pending>();
  private listeners = new Set<(event: ChatSocketEvent) => void>();
  private watches = new Map<string, Set<ActivityListener>>();
  private listening = false;
  private activities = new Map<string, ChatActivity | null>();
  get connected() { return this.socket?.readyState === 1; }

  subscribe(listener: (event: ChatSocketEvent) => void) {
    this.listeners.add(listener);
    this.connect();
    return () => { this.listeners.delete(listener); };
  }

  watch(chatId: string, listener: ActivityListener) {
    let watchers = this.watches.get(chatId);
    const first = !watchers;
    if (!watchers) { watchers = new Set(); this.watches.set(chatId, watchers); }
    watchers.add(listener);
    if (this.activities.has(chatId)) listener(this.activities.get(chatId) ?? null);
    if (first && this.socket?.readyState === 1) this.restoreWatch(chatId);
    this.connect();
    return () => {
      watchers.delete(listener);
      if (watchers.size) return;
      this.watches.delete(chatId);
      this.activities.delete(chatId);
      if (this.socket?.readyState === 1) void this.request('unwatch', chatId).catch(() => {
        // Reconnect clears server subscriptions if cleanup could not be confirmed.
        this.socket?.close();
      });
    };
  }

  request<T>(type: string, chatId?: string, payload?: unknown, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    if (this.disposed || !this.authorized()) return Promise.reject(new ChatSocketError(401));
    if (this.pending.size >= 512) return Promise.reject(new ChatSocketError(429));
    const id = String(++this.sequence);
    return new Promise<T>((resolve, reject) => {
      const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); this.pending.delete(id); };
      const fail = (error: Error) => { finish(); reject(error); };
      const abort = () => fail(new DOMException('Aborted', 'AbortError'));
      const timer = setTimeout(() => {
        fail(new ChatSocketError(408, 'Javob kelmadi. Qayta yuborishdan oldin chatni tekshiring.'));
        // A silent half-open connection must reconnect and reconcile its state.
        this.socket?.close();
      }, 10000);
      signal?.addEventListener('abort', abort, { once: true });
      let sent = false;
      this.pending.set(id, {
        reject: fail,
        resolve: value => { finish(); resolve(value as T); },
        send: () => {
          if (sent || signal?.aborted || this.socket?.readyState !== 1) return;
          sent = true;
          try { this.socket.send(JSON.stringify({ id, type, chatId, payload })); }
          catch { fail(new ChatSocketError(503)); this.socket.close(); }
        },
      });
      this.connect();
      this.pending.get(id)?.send();
    });
  }

  private emit(event: ChatSocketEvent) { this.listeners.forEach(listener => listener(event)); }
  private restoreWatch(chatId: string) {
    void this.request<ChatActivity>('watch', chatId).then(activity => {
      if (!this.watches.has(chatId)) return;
      this.activities.set(chatId, activity);
      this.watches.get(chatId)?.forEach(listener => listener(activity));
    }).catch(() => this.watches.get(chatId)?.forEach(listener => listener(null)));
  }
  private active = () => document.visibilityState === 'visible' && navigator.onLine;
  private heartbeat = () => {
    if (this.socket?.readyState === 1) void this.request('heartbeat', undefined, { active: this.active() }).catch(() => {});
  };
  private networkChanged = () => {
    if (!navigator.onLine) this.socket?.close();
    else { clearTimeout(this.reconnectTimer); this.reconnectTimer = undefined; this.connect(); }
  };
  private connect() {
    if (this.disposed || !this.authorized() || this.socket || this.reconnectTimer || typeof window === 'undefined') return;
    if (!this.listening) {
      this.listening = true;
      document.addEventListener('visibilitychange', this.heartbeat);
      window.addEventListener('online', this.networkChanged);
      window.addEventListener('offline', this.networkChanged);
    }
    if (!navigator.onLine) return;
    const url = new URL('/ws/chat', window.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    let socket: WebSocket;
    try { socket = new WebSocket(url.toString()); }
    catch { this.scheduleReconnect(); return; }
    this.socket = socket;
    this.openingTimer = setTimeout(() => socket.close(), 10000);
    socket.onopen = () => {
      if (this.socket !== socket || this.disposed) return;
      clearTimeout(this.openingTimer); this.attempt = 0;
      this.heartbeat();
      this.heartbeatTimer = setInterval(this.heartbeat, 15000);
      this.watches.forEach((_, chatId) => this.restoreWatch(chatId));
      this.pending.forEach(pending => pending.send());
      this.emit({ type: 'connected' });
    };
    socket.onmessage = event => {
      if (this.socket !== socket || this.disposed) return;
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (!data || typeof data !== 'object') return;
      if (data.type === 'result') this.pending.get(data.id)?.resolve(data.payload);
      else if (data.type === 'error') this.pending.get(data.id)?.reject(new ChatSocketError(data.status ?? 500, data.message));
      else if (data.type === 'changed' && typeof data.chatId === 'string') this.emit({ type: 'changed', chatId: data.chatId });
      else if (data.type === 'activity' && typeof data.chatId === 'string') {
        const activity = data.payload;
        if (typeof activity?.online === 'boolean' && typeof activity?.typing === 'boolean') {
          if (this.watches.has(data.chatId)) this.activities.set(data.chatId, activity);
          this.watches.get(data.chatId)?.forEach(listener => listener(activity));
        }
      }
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      clearTimeout(this.openingTimer); clearInterval(this.heartbeatTimer);
      this.pending.forEach(pending => pending.reject(new ChatSocketError(503, 'Aloqa uzildi. Qayta yuborishdan oldin chatni tekshiring.')));
      this.activities.clear();
      this.watches.forEach(listeners => listeners.forEach(listener => listener(null)));
      this.emit({ type: 'disconnected' });
      this.scheduleReconnect();
    };
  }
  private scheduleReconnect() {
    if (this.disposed || this.reconnectTimer || !navigator.onLine) return;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(this.attempt++, 5)) + Math.random() * 500;
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = undefined; this.connect(); }, delay);
  }
  close() {
    this.disposed = true;
    clearTimeout(this.reconnectTimer); clearTimeout(this.openingTimer); clearInterval(this.heartbeatTimer);
    document.removeEventListener('visibilitychange', this.heartbeat);
    window.removeEventListener('online', this.networkChanged);
    window.removeEventListener('offline', this.networkChanged);
    this.pending.forEach(pending => pending.reject(new ChatSocketError(401)));
    this.socket?.close(); this.socket = null; this.listeners.clear(); this.watches.clear(); this.activities.clear();
  }
}

const sockets = new Map<string, ChatSocket>();
let activeAccountId: string | null | undefined;
export function getChatSocket(accountId: string) {
  // Late effect cleanups and queued async work from a signed-out account must
  // never reopen a connection using the next account's cookies.
  if (activeAccountId !== undefined && accountId !== activeAccountId) return new ChatSocket(() => false);
  let socket = sockets.get(accountId);
  if (!socket) { socket = new ChatSocket(() => activeAccountId === undefined || activeAccountId === accountId); sockets.set(accountId, socket); }
  return socket;
}
export function closeOtherChatSockets(accountId: string | null) {
  activeAccountId = accountId;
  sockets.forEach((socket, id) => { if (id !== accountId) { socket.close(); sockets.delete(id); } });
}
