import Link from 'next/link';
import { Inbox, Paperclip } from 'lucide-react';

import { cn } from '@/lib/utils';
import { relativeUz } from '@/lib/mail-format';
import type { InboxMessage } from '@/lib/mail-types';

interface InboxListProps {
  mailboxId: string;
  mailboxEmail: string;
  messages: InboxMessage[];
  /** true when this render is a paged-past-the-end request. */
  emptySlice?: boolean;
}

/**
 * Renders a Gmail-like inbox — unread rows are bold with an emphasised
 * subject, read rows are muted. Whole row is a link into the message view;
 * clicking anywhere on the row navigates.
 */
export function InboxList({ mailboxId, mailboxEmail, messages, emptySlice }: InboxListProps) {
  if (messages.length === 0) {
    return <EmptyInbox emptySlice={emptySlice} />;
  }

  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card shadow-card">
      {messages.map((msg) => (
        <li key={msg.messageId}>
          <MessageRow mailboxId={mailboxId} msg={msg} />
        </li>
      ))}
      {/* Screen-reader-only mailbox context so a11y tools don't lose track of
          which inbox this list belongs to. */}
      <li className="sr-only" aria-live="polite">
        {mailboxEmail} pochtasidagi xatlar
      </li>
    </ul>
  );
}

function MessageRow({ mailboxId, msg }: { mailboxId: string; msg: InboxMessage }) {
  const displayFrom = msg.fromName || msg.fromAddress || 'Noma\'lum';
  return (
    <Link
      href={`/${mailboxId}/${encodeURIComponent(msg.messageId)}`}
      className={cn(
        'flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-3',
        !msg.seen && 'bg-primary/[0.04]',
      )}
    >
      <span
        className={cn(
          'shrink-0 truncate text-sm sm:w-40',
          msg.seen ? 'text-muted-foreground' : 'font-black text-foreground',
        )}
      >
        {displayFrom}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              'truncate text-sm',
              msg.seen ? 'text-foreground' : 'font-bold text-foreground',
            )}
          >
            {msg.subject || '(mavzu yo\'q)'}
          </span>
          {msg.hasAttachments && (
            <Paperclip
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-label="Ilova bor"
            />
          )}
        </span>
        <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
          {msg.snippet}
        </span>
      </span>
      <span className="shrink-0 text-[11px] font-medium text-muted-foreground sm:w-24 sm:text-right">
        {relativeUz(msg.receivedAt)}
      </span>
    </Link>
  );
}

function EmptyInbox({ emptySlice }: { emptySlice?: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-4 py-12 text-center shadow-card">
      <Inbox className="mx-auto h-8 w-8 text-muted-foreground/50" />
      <h2 className="mt-2 text-sm font-bold text-foreground">
        {emptySlice ? 'Xatlar tugadi' : 'Xatlar yo\'q'}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {emptySlice
          ? 'Bu sahifada boshqa xatlar yo\'q.'
          : 'Pochtangizga hali hech qanday xat kelmagan.'}
      </p>
    </div>
  );
}
