/**
 * Shapes returned by trade-service's `/api/v1/admin/mailboxes/**` endpoints.
 * Mirrors `AdminMailboxResponse`, `MailboxSummary`, `InboxPage` and
 * `MessageDetail` on the Java side — keep them in sync.
 */

export type MailboxSource = 'TRADE' | 'ADMIN';

export interface AdminMailbox {
  id: string;
  email: string;
  ownerUserId: string | null;
  tradeId: string | null;
  source: MailboxSource;
  createdByAdminId: string | null;
  createdAt: string;
  /** null → Mailcow hasn't confirmed the box yet (still provisioning). */
  provisionedAt: string | null;
  handedOffAt: string | null;
  deletedAt: string | null;
}

/** Live IMAP counters. Both can be null when Mailcow is unreachable. */
export interface MailboxSummary {
  id: string;
  email: string;
  unreadCount: number | null;
  lastActivityAt: string | null;
  ownedSince: string;
}

export interface InboxMessage {
  messageId: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  receivedAt: string;
  snippet: string;
  seen: boolean;
  hasAttachments: boolean;
}

export interface InboxPage {
  messages: InboxMessage[];
  total: number;
  limit: number;
  offset: number;
}

export interface AttachmentMeta {
  attachmentId: string;
  filename: string | null;
  contentType: string;
  sizeBytes: number;
}

export interface MessageDetail {
  messageId: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  toAddresses: string[];
  ccAddresses: string[];
  receivedAt: string;
  /** Already sanitised server-side (Jsoup safelist). */
  bodyHtml: string | null;
  bodyPlain: string | null;
  attachments: AttachmentMeta[];
  seen: boolean;
}

export interface CreateMailboxInput {
  localPart: string;
  ownerUserId: string;
}
