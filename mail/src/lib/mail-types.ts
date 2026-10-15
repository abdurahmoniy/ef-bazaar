/**
 * Wire shapes for the read-only webmail feature. Mirrors the trade-service
 * DTOs 1:1 — see `uz.efbazaar.trade.mail.dto.*`.
 */

export interface MailboxSummary {
  id: string;
  email: string;
  /** Optional during rollout; null means the owner has not named this mailbox. */
  displayName?: string | null;
  /** null when IMAP was transiently unreachable — render "—" not "0". */
  unreadCount: number | null;
  /** ISO-8601 timestamp of the newest message, or null when the inbox is empty. */
  lastActivityAt: string | null;
  /** When this mailbox became visible to the current owner (handoff or create). */
  ownedSince: string;
  /** Over the plan limit: no content is served; unreadCount and lastActivityAt are null. */
  locked: boolean;
}

export interface InboxMessage {
  /** IMAP UID as a decimal string — safe to embed in a URL. */
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
  filename: string;
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
  /** Sanitised server-side (Jsoup safelist) — never contains scripts/iframes/images. */
  bodyHtml: string | null;
  bodyPlain: string | null;
  attachments: AttachmentMeta[];
  seen: boolean;
}
