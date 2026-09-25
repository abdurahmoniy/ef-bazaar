'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { commitChatMessages } from '@/lib/chat-cache';
import { getChatSocket } from '@/lib/chat-socket';
import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';
import type { MessageResponse } from '@/lib/marketplace-types';

export interface OutboxInput {
  content: string;
  file?: File | null;
  voice?: boolean;
  replyTo?: MessageResponse | null;
}
export interface OutboxEntry extends OutboxInput {
  clientMessageId: string;
  createdAt: string;
  status: 'sending' | 'failed';
  error?: string;
}

export function useChatOutbox(viewerId: string, chatId: string, messages: MessageResponse[]) {
  const client = useQueryClient();
  const key = useMemo(() => ['private', viewerId, 'chats', chatId, 'outbox'] as const, [viewerId, chatId]);
  const storageKey = `chat-outbox:${encodeURIComponent(viewerId)}:${encodeURIComponent(chatId)}`;
  const { data: entries } = useQuery<OutboxEntry[]>({
    queryKey: key, queryFn: () => client.getQueryData<OutboxEntry[]>(key) ?? [], enabled: false, gcTime: Infinity,
    initialData: [],
  });
  // Match the server's empty outbox during hydration. Restore only after mount,
  // and preserve any live upload already retained by this account's cache.
  useEffect(() => {
    const owner = client.getQueryCache().find({ queryKey: key, exact: true });
    if (!owner || client.getQueryData<OutboxEntry[]>(key)?.length) return;
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? '[]');
      if (!Array.isArray(saved)) return;
      const restored: OutboxEntry[] = saved.filter(entry => entry && typeof entry.clientMessageId === 'string'
        && typeof entry.content === 'string' && typeof entry.createdAt === 'string' && !entry.file)
        .map(entry => ({ ...entry, status: 'failed', error: 'Yuborilganini tekshirish uchun qayta urining.' }));
      if (restored.length && client.getQueryCache().find({ queryKey: key, exact: true }) === owner) {
        client.setQueryData(key, restored);
      }
    } catch { /* An unavailable store must not prevent composing. */ }
  }, [client, key, storageKey]);
  const update = useCallback((fn: (items: OutboxEntry[]) => OutboxEntry[]) => {
    client.setQueryData<OutboxEntry[]>(key, previous => {
      const next = fn(previous ?? []);
      // Binary files stay in the query cache across navigation. Text retries
      // also survive reloading this tab and always retain their original ID.
      try {
        const text = next.filter(entry => !entry.file);
        if (text.length) sessionStorage.setItem(storageKey, JSON.stringify(text));
        else sessionStorage.removeItem(storageKey);
      } catch { /* A full/disabled store must not prevent sending. */ }
      return next;
    });
  }, [client, key, storageKey]);
  const confirmed = new Set(messages.filter(message => message.senderId === viewerId).map(message => message.clientMessageId));
  const visible = entries.filter(entry => !confirmed.has(entry.clientMessageId));
  useEffect(() => {
    const delivered = new Set(messages.filter(message => message.senderId === viewerId).map(message => message.clientMessageId));
    const previous = client.getQueryData<OutboxEntry[]>(key) ?? [];
    if (previous.some(entry => delivered.has(entry.clientMessageId))) update(items => items.filter(entry => !delivered.has(entry.clientMessageId)));
  }, [messages, viewerId, client, key, update]);

  async function transmit(entry: OutboxEntry) {
    const owner = client.getQueryCache().find({ queryKey: key, exact: true });
    const isCurrent = () => !!owner && client.getQueryCache().find({ queryKey: key, exact: true }) === owner;
    try {
      let message: MessageResponse;
      if (entry.file) {
        const form = new FormData();
        form.append('file', entry.file);
        form.append('clientMessageId', entry.clientMessageId);
        if (entry.content) form.append('caption', entry.content);
        if (entry.voice) form.append('voice', 'true');
        if (entry.replyTo) form.append('replyToId', entry.replyTo.id);
        const response = await fetch(buildMarketplaceApiPath(['v1', 'chats', chatId, 'messages', 'attachments']), {
          method: 'POST', credentials: 'include', body: form, signal: AbortSignal.timeout(60_000),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.message ?? body?.error ?? 'Fayl yuborilmadi');
        }
        message = await response.json();
      } else {
        message = await getChatSocket(viewerId).request<MessageResponse>('send', chatId, {
          content: entry.content, replyToId: entry.replyTo?.id ?? null, clientMessageId: entry.clientMessageId,
        });
      }
      if (!isCurrent()) return;
      await commitChatMessages(client, viewerId, chatId, previous => {
        const byId = new Map(previous.map(item => [item.id, item]));
        byId.set(message.id, message);
        return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      }, isCurrent);
      if (!isCurrent()) return;
      update(items => items.filter(item => item.clientMessageId !== entry.clientMessageId));
    } catch (error) {
      if (!isCurrent()) return;
      update(items => items.map(item => item.clientMessageId === entry.clientMessageId
        ? { ...item, status: 'failed', error: error instanceof Error ? error.message : 'Xabar yuborilmadi' } : item));
    }
  }
  return {
    entries: visible,
    dismiss(id: string) {
      update(items => items.filter(item => item.clientMessageId !== id || item.status !== 'failed'));
    },
    send(input: OutboxInput) {
      const entry: OutboxEntry = { ...input, clientMessageId: crypto.randomUUID(), createdAt: new Date().toISOString(), status: 'sending' };
      update(items => [...items, entry]);
      void transmit(entry);
    },
    retry(id: string) {
      const entry = client.getQueryData<OutboxEntry[]>(key)?.find(item => item.clientMessageId === id);
      if (!entry || entry.status === 'sending') return;
      update(items => items.map(item => item.clientMessageId === id ? { ...item, status: 'sending', error: undefined } : item));
      void transmit(entry);
    },
  };
}
