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
  accessState?: 'ACTIVE' | 'GRACE' | 'RECOVERY';
  paidExpiresAt?: string | null;
  graceEndsAt?: string | null;
  selectedForFree?: boolean;
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
  criticalRecovery?: boolean;
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
  criticalRecovery?: boolean;
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

/** Allocation quota from /trade/v1/mailboxes/slots; custom is a subset of total. */
export interface MailboxSlotStatus {
  used: number;
  limit: number | null;
  totalUsed: number;
  /** null only for an explicitly unlimited plan. */
  totalLimit: number | null;
  customUsed: number;
  customLimit: number | null;
  exemptUsed?: number;
  resourceUsed?: number;
  full: boolean;
  plan: string;
  lockedCount: number;
}

/** Keep random-only or incomplete rollout responses out of the quota display. */
export function isMailboxSlotStatus(value: unknown): value is MailboxSlotStatus {
  if (!value || typeof value !== 'object') return false;
  const status = value as Record<string, unknown>;
  const count = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
  const limit = (v: unknown) => v === null || count(v);
  return count(status.totalUsed) && limit(status.totalLimit)
    && count(status.customUsed) && limit(status.customLimit)
    && count(status.lockedCount) && typeof status.full === 'boolean'
    && typeof status.plan === 'string'
    && (status.exemptUsed === undefined || count(status.exemptUsed))
    && (status.resourceUsed === undefined || count(status.resourceUsed));
}

/** Legacy locks still block content; explicit Recovery uses the filtered backend API. */
export function legacyMailboxLocked(box: Pick<MailboxSummary, 'locked' | 'accessState'>): boolean {
  return !box.accessState && box.locked;
}
