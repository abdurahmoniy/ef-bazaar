import Link from 'next/link';
import { Inbox, Lock } from 'lucide-react';

import { cn } from '@/lib/utils';
import { fullDateUz, mailAvatarColor, mailAvatarInitial, relativeUz } from '@/lib/mail-format';
import type { MailboxSlotStatus, MailboxSummary } from '@/lib/mail-types';

interface MailSidebarProps {
  mailboxes: MailboxSummary[];
  /** UUID of the mailbox currently open, or null on the empty landing. */
  activeMailboxId: string | null;
  /** Hides the section label when the parent (mobile drawer) has its own. */
  hideHeader?: boolean;
  slots?: MailboxSlotStatus | null;
}

/**
 * Gmail-style account switcher for the /mail feature. Renders one row per
 * owned mailbox with a colored avatar circle, email, unread badge, and
 * relative last activity. Server component — every mailbox's row is a plain
 * <Link> so navigation between mailboxes triggers a fresh SSR fetch.
 */
export function MailSidebar({ mailboxes, activeMailboxId, hideHeader, slots }: MailSidebarProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {!hideHeader && (
        <div className="flex items-center justify-between px-4 pb-1 pt-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Pochtalarim
          </span>
          {mailboxes.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold tabular-nums text-muted-foreground">
              {mailboxes.length}
            </span>
          )}
        </div>
      )}
      {slots?.plan !== 'STAFF' && (
        <p className="px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          {slots ? `Jami: ${slots.totalUsed} / ${slots.totalLimit === null ? 'cheksiz' : slots.totalLimit} · shundan custom: ${slots.customUsed} / ${slots.customLimit === null ? 'cheksiz' : slots.customLimit}` : 'Pochta limiti aniqlanmadi'}
          {slots?.exemptUsed !== undefined && slots.resourceUsed !== undefined && ` · Limitdan tashqari qutilar: ${slots.exemptUsed} · Resursda: ${slots.resourceUsed}`}
          {slots && <span className="mt-1 block">Custom chegarasi yangi nomli quti yaratish uchun; mavjud qutini o‘qish umumiy limit bo‘yicha tanlanadi.</span>}
        </p>
      )}
      {mailboxes.length === 0 ? (
        <EmptySidebar />
      ) : (
        <nav className="min-h-0 flex-1 overflow-y-auto p-2" aria-label="Pochtalar">
          <ul className="space-y-0.5">
            {mailboxes.map((mb) => (
              <li key={mb.id}>
                <MailboxRow mailbox={mb} active={mb.id === activeMailboxId} />
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

function MailboxRow({ mailbox, active }: { mailbox: MailboxSummary; active: boolean }) {
  const locked = !mailbox.accessState && mailbox.locked;
  const stateLabel = mailbox.accessState === 'RECOVERY' ? 'Recovery · Konami xavfsizlik xatlari' : mailbox.accessState === 'GRACE' ? 'Grace · to‘liq o‘qish' : null;
  const unread = mailbox.unreadCount;
  const hasUnread = !locked && typeof unread === 'number' && unread > 0;

  return (
    <Link
      href={`/${mailbox.id}`}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex items-center gap-3 rounded-lg py-2.5 pl-3.5 pr-2.5 transition-colors active:bg-muted',
        active ? 'bg-accent text-accent-foreground shadow-sm' : 'hover:bg-muted',
      )}
    >
      {active && (
        <span
          className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary"
          aria-hidden
        />
      )}
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black text-white shadow-sm"
        style={{ backgroundColor: mailAvatarColor(mailbox.email) }}
        aria-hidden
      >
        {mailAvatarInitial(mailbox.email)}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-sm text-foreground',
            active || hasUnread ? 'font-bold' : 'font-medium',
          )}
        >
          {mailbox.displayName || mailbox.email}
        </span>
        {mailbox.displayName && (
          <span className="block truncate text-[11px] text-muted-foreground" title={mailbox.email}>
            {mailbox.email}
          </span>
        )}
        <span
          className={cn(
            'block truncate text-[11px]',
            hasUnread ? 'font-semibold text-primary' : 'text-muted-foreground',
          )}
          title={fullDateUz(mailbox.lastActivityAt)}
        >
          {stateLabel ?? (locked ? 'Qulflangan' : relativeUz(mailbox.lastActivityAt))}
        </span>
      </span>
      {locked && (
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground"
          role="img"
          aria-label="Qulflangan"
        >
          <Lock className="h-3.5 w-3.5" aria-hidden />
        </span>
      )}
      {hasUnread && (
        <span
          className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-black tabular-nums text-primary-foreground"
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
    <div className="px-6 py-10 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted">
        <Inbox className="h-5 w-5 text-muted-foreground/70" />
      </span>
      <p className="mt-3 text-xs font-bold text-foreground">Sizda pochta yo&apos;q</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        Savdo yakunlanganda pochta shu yerda paydo bo&apos;ladi.
      </p>
    </div>
  );
}
