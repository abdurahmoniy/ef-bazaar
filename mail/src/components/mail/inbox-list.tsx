import Link from 'next/link';
import { Inbox, Paperclip } from 'lucide-react';

import { cn } from '@/lib/utils';
import { fullDateUz, listTimeUz } from '@/lib/mail-format';
import type { InboxMessage } from '@/lib/mail-types';

interface InboxListProps {
  mailboxId: string;
  mailboxEmail: string;
  messages: InboxMessage[];
  /** true when this render is a paged-past-the-end request. */
  emptySlice?: boolean;
}

/**
 * Gmail-like inbox list. On sm+ each message is one dense scannable line —
 * unread dot, sender column, "subject — snippet", time — with unread rows
 * bold on a tinted background. On mobile the row stacks into sender+time /
 * subject+snippet. Whole row is a link into the message view.
 */
export function InboxList({ mailboxId, mailboxEmail, messages, emptySlice }: InboxListProps) {
  if (messages.length === 0) {
    return <EmptyInbox emptySlice={emptySlice} />;
  }

  return (
    <ul className="divide-y divide-border/60">
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
  const time = (
    <time
      className={cn(
        'shrink-0 whitespace-nowrap text-xs tabular-nums',
        msg.seen ? 'text-muted-foreground' : 'font-bold text-primary',
      )}
      title={fullDateUz(msg.receivedAt)}
    >
      {listTimeUz(msg.receivedAt)}
    </time>
  );

  return (
    <Link
      href={`/${mailboxId}/${encodeURIComponent(msg.messageId)}`}
      className={cn(
        'flex flex-col gap-0.5 px-4 py-3 transition-colors hover:bg-muted/60 active:bg-muted sm:flex-row sm:items-center sm:gap-4 sm:px-6 sm:py-2.5',
        !msg.seen && 'bg-primary/[0.04]',
      )}
    >
      {/* Sender column; on mobile this line also carries attachment + time. */}
      <span className="flex items-center justify-between gap-2 sm:w-52 sm:shrink-0 sm:justify-start">
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn('h-2 w-2 shrink-0 rounded-full', msg.seen ? 'bg-transparent' : 'bg-primary')}
            aria-hidden
          />
          <span
            className={cn(
              'truncate text-sm',
              msg.seen ? 'text-muted-foreground' : 'font-bold text-foreground',
            )}
          >
            {displayFrom}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 sm:hidden">
          {msg.hasAttachments && (
            <Paperclip className="h-3.5 w-3.5 text-muted-foreground" aria-label="Ilova bor" />
          )}
          {time}
        </span>
      </span>

      {/* Subject — snippet, single truncated line (Gmail pattern). */}
      <span className="min-w-0 flex-1 pl-[18px] sm:pl-0">
        <span className="block truncate text-sm">
          <span className={cn(msg.seen ? 'text-foreground' : 'font-bold text-foreground')}>
            {msg.subject || '(mavzu yo\'q)'}
          </span>
          {msg.snippet && (
            <span className="font-normal text-muted-foreground"> — {msg.snippet}</span>
          )}
        </span>
      </span>

      <span className="hidden shrink-0 items-center gap-3 sm:flex">
        {msg.hasAttachments && (
          <Paperclip className="h-3.5 w-3.5 text-muted-foreground" aria-label="Ilova bor" />
        )}
        <span className="w-20 text-right">{time}</span>
      </span>
    </Link>
  );
}

function EmptyInbox({ emptySlice }: { emptySlice?: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-muted">
        <Inbox className="h-6 w-6 text-muted-foreground/70" />
      </span>
      <h2 className="mt-4 text-sm font-bold text-foreground">
        {emptySlice ? 'Xatlar tugadi' : 'Xatlar yo\'q'}
      </h2>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
        {emptySlice
          ? 'Bu sahifada boshqa xatlar yo\'q.'
          : 'Pochtangizga hali hech qanday xat kelmagan.'}
      </p>
    </div>
  );
}
