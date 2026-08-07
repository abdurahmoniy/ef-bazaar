import 'server-only';

import { apiFetch, ApiException } from './api';
import type { FetchResult } from './marketplace-server';
import type {
  AdminMailbox,
  InboxPage,
  MailboxFilter,
  MailboxStats,
  MailboxSummary,
  MessageDetail,
} from './mailbox-admin-types';
import type { PageResponse } from './marketplace-types';
import type { User } from './types';

/**
 * trade-service admin mailbox API. `/trade/...` is stripped by nginx, so
 * `/trade/v1/admin/mailboxes` lands on trade-service's
 * `/api/v1/admin/mailboxes` (same hop the browser proxy route uses).
 */
const ADMIN_MAILBOX_PREFIX = '/trade/v1/admin/mailboxes';

async function safeFetch<T>(path: string): Promise<FetchResult<T>> {
  try {
    return { ok: true, data: await apiFetch<T>(path) };
  } catch (error) {
    if (error instanceof ApiException) {
      console.error(
        `[mailbox-admin-server] ${path} → ${error.status} ${error.code ?? ''}: ${error.message}`,
      );
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
    console.error(`[mailbox-admin-server] ${path} → network error:`, message);
    return {
      ok: false,
      error: { path, status: 0, message, networkError: true },
    };
  }
}

export async function getAdminMailboxes(
  options: {
    search?: string;
    ownerUserId?: string;
    filter?: MailboxFilter;
    page?: number;
    size?: number;
  } = {},
): Promise<FetchResult<PageResponse<AdminMailbox>>> {
  const params = new URLSearchParams({
    page: String(options.page ?? 0),
    size: String(options.size ?? 20),
  });
  if (options.search) params.set('search', options.search);
  if (options.ownerUserId) params.set('ownerUserId', options.ownerUserId);
  if (options.filter === 'trade') params.set('source', 'TRADE');
  if (options.filter === 'admin') params.set('source', 'ADMIN');
  if (options.filter === 'pending') params.set('pending', 'true');
  if (options.filter === 'unassigned') params.set('unassigned', 'true');
  return safeFetch<PageResponse<AdminMailbox>>(`${ADMIN_MAILBOX_PREFIX}?${params.toString()}`);
}

/** Chip counters. Failure degrades to no chips rather than an error page. */
export async function getAdminMailboxStats(): Promise<MailboxStats | null> {
  const result = await safeFetch<MailboxStats>(`${ADMIN_MAILBOX_PREFIX}/stats`);
  return result.ok ? result.data : null;
}

export async function getAdminMailbox(id: string): Promise<FetchResult<AdminMailbox>> {
  return safeFetch<AdminMailbox>(`${ADMIN_MAILBOX_PREFIX}/${encodeURIComponent(id)}`);
}

/**
 * Live unread / last-activity counters. Fetched separately from the row itself
 * because it costs an IMAP round trip — the detail header still renders when
 * this fails.
 */
export async function getAdminMailboxSummary(
  id: string,
): Promise<FetchResult<MailboxSummary>> {
  return safeFetch<MailboxSummary>(`${ADMIN_MAILBOX_PREFIX}/${encodeURIComponent(id)}/summary`);
}

export async function getAdminMailboxInbox(
  id: string,
  limit = 25,
  offset = 0,
): Promise<FetchResult<InboxPage>> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return safeFetch<InboxPage>(
    `${ADMIN_MAILBOX_PREFIX}/${encodeURIComponent(id)}/inbox?${params.toString()}`,
  );
}

export async function getAdminMailboxMessage(
  id: string,
  messageId: string,
): Promise<FetchResult<MessageDetail>> {
  return safeFetch<MessageDetail>(
    `${ADMIN_MAILBOX_PREFIX}/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}`,
  );
}

/**
 * Resolves mailbox owners to display names. trade-service only stores
 * `owner_user_id`, so the join happens here against auth-service. Unknown ids
 * are simply missing from the map (the user was deleted) — callers render
 * those as "o'chirilgan foydalanuvchi".
 */
export async function getUsersByIds(ids: string[]): Promise<Map<string, User>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const params = new URLSearchParams({ ids: unique.join(',') });
  const result = await safeFetch<User[]>(`/auth/v1/admin/users/by-ids?${params.toString()}`);
  if (!result.ok) return new Map();
  return new Map(result.data.map((user) => [user.id, user]));
}
