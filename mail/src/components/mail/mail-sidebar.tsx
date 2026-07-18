import Link from 'next/link';
import { Inbox, Mail } from 'lucide-react';

import { cn } from '@/lib/utils';
import { mailAvatarInitial, relativeUz } from '@/lib/mail-format';
import type { MailboxSummary } from '@/lib/mail-types';

interface MailSidebarProps {
  mailboxes: MailboxSummary[];
  /** UUID of the mailbox currently open, or null on the empty landing. */
  activeMailboxId: string | null;
  /** Hides the sidebar container styles when embedded inside a mobile sheet. */
  variant?: 'panel' | 'flat';
}

/**
 * Gmail-style account switcher for the /mail feature. Renders one row per
 * owned mailbox with an avatar circle, email, unread badge, and relative last
 * activity. Server component — every mailbox's row is a plain <Link> so
 * navigation between mailboxes triggers a fresh SSR fetch.
 */
export function MailSidebar({ mailboxes, activeMailboxId, variant = 'panel' }: MailSidebarProps) {
  const wrapperClass = variant === 'panel'
    ? 'rounded-xl border border-border bg-card shadow-card'
    : '';

  return (
    <aside className={wrapperClass}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Mail className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Pochta
        </span>
      </div>
      {mailboxes.length === 0 ? (
        <EmptySidebar />
      ) : (
        <ul className="max-h-[calc(100vh-14rem)] overflow-y-auto p-2">
          {mailboxes.map((mb) => (
            <li key={mb.id}>
              <MailboxRow mailbox={mb} active={mb.id === activeMailboxId} />
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function MailboxRow({ mailbox, active }: { mailbox: MailboxSummary; active: boolean }) {
  const unread = mailbox.unreadCount;
  const initial = mailAvatarInitial(mailbox.email);

  return (
    <Link
      href={`/${mailbox.id}`}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg px-2 py-2 transition-colors',
        active
          ? 'bg-primary/10 text-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <span
        className={cn(
          'grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black',
          active ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
        )}
        aria-hidden
      >
        {initial}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">
          {mailbox.email}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {relativeUz(mailbox.lastActivityAt)}
        </span>
      </span>
      {typeof unread === 'number' && unread > 0 && (
        <span
          className={cn(
            'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-black',
            active ? 'bg-primary-foreground text-primary' : 'bg-primary text-primary-foreground',
          )}
          aria-label={`${unread} yangi xat`}
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}

function EmptySidebar() {
  return (
    <div className="p-6 text-center">
      <Inbox className="mx-auto h-8 w-8 text-muted-foreground/50" />
      <p className="mt-2 text-xs font-semibold text-foreground">Sizda pochta yo&apos;q</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Savdo yakunlanganda pochta shu yerda paydo bo&apos;ladi.
      </p>
    </div>
  );
}
