import 'server-only';

import { cache } from 'react';

import { apiFetch, ApiException } from './api';
import type {
  InboxPage,
  MailboxSummary,
  MessageDetail,
} from './mail-types';

/**
 * Server-side fetchers for the read-only webmail app. All reads go through
 * internal nginx (`INTERNAL_API_BASE_URL` → `/api/trade/v1/mail/**`), which
 * strips the `/trade/` prefix and forwards to trade-service at
 * `/api/v1/mail/**`.
 *
 * IMAP hiccups (dovecot brief unavailability, network blips, credential
 * decryption errors) come back as 5xx from the backend. We surface those
 * as `null` on read paths so the UI can render a graceful "temporarily
 * unavailable" state instead of throwing.
 */
const MAIL_PREFIX = '/trade/v1/mail';

/** 403 `mailbox_locked`: the mailbox became locked between the list and this call. */
export class MailboxLockedError extends Error {
  constructor() {
    super('mailbox_locked');
  }
}

async function safeGet<T>(path: string): Promise<T | null> {
  try {
    return await apiFetch<T>(path);
  } catch (error) {
    if (error instanceof ApiException) {
      if (error.status === 403 && error.code === 'mailbox_locked') {
        throw new MailboxLockedError();
      }
      if (error.status === 401 || error.status === 403 || error.status === 404) {
        return null;
      }
      console.error(
        `[mail-server] ${path} → ${error.status} ${error.code ?? ''}: ${error.message}`,
      );
      return null;
    }
    console.error(`[mail-server] ${path} → network error:`, error);
    return null;
  }
}

/**
 * Sidebar list — mailboxes owned by the caller with unread/last-activity.
 * Wrapped in React cache() so the [mailboxId] layout and its pages share one
 * backend call per request instead of fetching the list twice.
 */
export const getMyMailboxes = cache(async (): Promise<MailboxSummary[]> => {
  return (await safeGet<MailboxSummary[]>(`${MAIL_PREFIX}/mailboxes`)) ?? [];
});

/** Paginated inbox slice for one mailbox. */
export async function getInbox(
  mailboxId: string,
  { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {},
): Promise<InboxPage | null> {
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return await safeGet<InboxPage>(
    `${MAIL_PREFIX}/${encodeURIComponent(mailboxId)}/inbox?${qs.toString()}`,
  );
}

/** Full message payload (sanitised body + attachment list). */
export async function getMessage(
  mailboxId: string,
  messageId: string,
): Promise<MessageDetail | null> {
  return await safeGet<MessageDetail>(
    `${MAIL_PREFIX}/${encodeURIComponent(mailboxId)}/messages/${encodeURIComponent(messageId)}`,
  );
}

/** Client-facing download URL for an attachment — points at the same-origin proxy. */
export function attachmentDownloadUrl(
  mailboxId: string,
  messageId: string,
  attachmentId: string,
): string {
  return `/api/trade/v1/mail/${encodeURIComponent(mailboxId)}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`;
}
