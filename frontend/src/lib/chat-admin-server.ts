import 'server-only';

import { apiFetch, ApiException } from './api';
import type { AdminChatListingEvent, AdminChatResponse } from './chat-admin-types';
import type { FetchResult } from './marketplace-server';
import type { MessageResponse, PageResponse } from './marketplace-types';

/**
 * SSR reads for the admin chat viewer. Everything here is GET against
 * marketplace-service's `/api/v1/admin/chats`, which never marks anything read
 * — the parties cannot tell an admin has looked.
 */
const PREFIX = '/marketplace/v1/admin/chats';

async function safeFetch<T>(path: string): Promise<FetchResult<T>> {
  try {
    return { ok: true, data: await apiFetch<T>(path) };
  } catch (error) {
    if (error instanceof ApiException) {
      console.error(`[chat-admin-server] ${path} → ${error.status} ${error.code ?? ''}`);
      return {
        ok: false,
        error: {
          path,
          status: error.status,
          code: error.code,
          message: error.message,
          details: error.details,
        },
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[chat-admin-server] ${path} → network error:`, message);
    return { ok: false, error: { path, status: 0, message, networkError: true } };
  }
}

export async function getAdminChats(
  query: string | undefined,
  page = 0,
  size = 20,
  /** O'chirilgan chatlar alohida ro'yxatda — toza ro'yxat ichida turmaydi. */
  deleted = false,
): Promise<FetchResult<PageResponse<AdminChatResponse>>> {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (query?.trim()) params.set('q', query.trim());
  if (deleted) params.set('deleted', 'true');
  return safeFetch<PageResponse<AdminChatResponse>>(`${PREFIX}?${params.toString()}`);
}

export async function getAdminChat(id: string): Promise<FetchResult<AdminChatResponse>> {
  return safeFetch<AdminChatResponse>(`${PREFIX}/${encodeURIComponent(id)}`);
}

export async function getAdminChatListingHistory(id: string): Promise<FetchResult<AdminChatListingEvent[]>> {
  return safeFetch<AdminChatListingEvent[]>(`${PREFIX}/${encodeURIComponent(id)}/listing-history`);
}

/** Newest first: page 0 holds the latest messages. */
export async function getAdminChatMessages(
  id: string,
  page = 0,
  size = 100,
): Promise<FetchResult<PageResponse<MessageResponse>>> {
  return safeFetch<PageResponse<MessageResponse>>(
    `${PREFIX}/${encodeURIComponent(id)}/messages?page=${page}&size=${size}`,
  );
}
