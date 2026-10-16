import Link from 'next/link';
import { ChevronRight, Inbox, Mail, Search, UserRound, X } from 'lucide-react';

import { AdminMailboxCreate } from '@/components/admin/admin-mailbox-create';
import { MailboxStatusBadge } from '@/components/admin/mailbox-status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { avatarTone, partnerInitial } from '@/lib/chat-format';
import { formatListingDate } from '@/lib/marketplace-format';
import type { AdminMailbox, MailboxFilter, MailboxStats } from '@/lib/mailbox-admin-types';
import type { User } from '@/lib/types';
import { cn } from '@/lib/utils';

interface AdminMailboxesProps {
  mailboxes: AdminMailbox[];
  /** ownerUserId → user, resolved from auth-service. Missing = deleted user. */
  owners: Record<string, User>;
  search?: string;
  ownerUserId?: string;
  ownerUser: User | null;
  filter: MailboxFilter;
  stats: MailboxStats | null;
  totalElements: number;
  /** Owner dropdown source for the create form. */
  selectableUsers: User[];
  mailDomain: string;
  /** Domains the create form offers, default first. */
  mailDomains?: string[];
}

const FILTERS: Array<{ key: MailboxFilter; label: string; count: (s: MailboxStats) => number }> = [
  { key: 'all', label: 'Hammasi', count: (s) => s.total },
  { key: 'trade', label: 'Savdo', count: (s) => s.trade },
  { key: 'admin', label: 'Admin', count: (s) => s.admin },
  { key: 'pending', label: 'Kutilmoqda', count: (s) => s.pending },
  { key: 'unassigned', label: 'Egasiz', count: (s) => s.unassigned },
];

export function AdminMailboxes({
  mailboxes,
  owners,
  search,
  ownerUserId,
  ownerUser,
  filter,
  stats,
  totalElements,
  selectableUsers,
  mailDomain,
  mailDomains,
}: AdminMailboxesProps) {
  const buildFilterHref = (key: MailboxFilter) => {
    const query = new URLSearchParams();
    if (key !== 'all') query.set('filter', key);
    if (search) query.set('search', search);
    if (ownerUserId) query.set('ownerUserId', ownerUserId);
    const qs = query.toString();
    return qs ? `/admin/mailboxes?${qs}` : '/admin/mailboxes';
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-black tracking-tight">Pochtalar</h1>
          <p className="text-sm font-medium text-muted-foreground">
            Escrow va admin pochta qutilari — egasi, holati va kelgan xatlar.
          </p>
        </div>
        <AdminMailboxCreate
          users={selectableUsers}
          lockedOwner={ownerUser}
          lockedOwnerId={ownerUserId}
          mailDomain={mailDomain}
          mailDomains={mailDomains}
        />
      </header>

      {/* Filter chips double as the counter row — no separate stat tiles to
          keep the page scannable in one glance. */}
      {stats && (
        <nav className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 no-scrollbar">
          {FILTERS.map((entry) => {
            const active = entry.key === filter;
            return (
              <Link
                key={entry.key}
                href={buildFilterHref(entry.key)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition',
                  active
                    ? 'border-primary bg-primary text-primary-foreground shadow-card'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                {entry.label}
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-xs font-black tabular-nums',
                    active ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {entry.count(stats)}
                </span>
              </Link>
            );
          })}
        </nav>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <form
          action="/admin/mailboxes"
          className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1"
        >
          {ownerUserId && <input type="hidden" name="ownerUserId" value={ownerUserId} />}
          {filter !== 'all' && <input type="hidden" name="filter" value={filter} />}
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              name="search"
              defaultValue={search ?? ''}
              placeholder="Manzil bo'yicha qidirish"
              className="pl-9"
            />
          </div>
          <Button type="submit" size="sm" variant="outline" className="shrink-0">
            Qidirish
          </Button>
        </form>
        <p className="shrink-0 text-sm font-semibold text-muted-foreground">
          {totalElements} ta natija
        </p>
      </div>

      {(ownerUserId || search) && (
        <div className="flex flex-wrap items-center gap-2">
          {ownerUserId && (
            <ActiveFilterPill
              icon={<UserRound className="h-3.5 w-3.5" />}
              label={ownerUser?.displayName ?? "o'chirilgan foydalanuvchi"}
              href={buildRemoveOwnerHref(search, filter)}
            />
          )}
          {search && (
            <ActiveFilterPill
              icon={<Search className="h-3.5 w-3.5" />}
              label={search}
              href={buildRemoveSearchHref(ownerUserId, filter)}
            />
          )}
        </div>
      )}

      {mailboxes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/40 py-16 text-center">
          <div className="rounded-full bg-muted p-3">
            <Inbox className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-black">Pochta topilmadi</p>
            <p className="text-sm text-muted-foreground">
              Filtrni o&apos;zgartiring yoki yangi pochta ro&apos;yxatdan o&apos;tkazing.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          {/* Column captions only on wide screens — the mobile layout stacks
              the same fields with their own inline labels. */}
          <div className="hidden grid-cols-[minmax(0,1fr)_170px_150px_28px] gap-4 border-b border-border bg-muted/40 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground md:grid">
            <span>Manzil</span>
            <span>Egasi</span>
            <span>Yaratilgan</span>
            <span />
          </div>

          <ul className="divide-y divide-border">
            {mailboxes.map((mailbox) => {
              const owner = mailbox.ownerUserId ? owners[mailbox.ownerUserId] : undefined;
              return (
                <li key={mailbox.id}>
                  <Link
                    href={`/admin/mailboxes/${mailbox.id}`}
                    className="group grid gap-2 px-4 py-3 transition hover:bg-accent/40 md:grid-cols-[minmax(0,1fr)_180px_180px_28px] md:items-center md:gap-4"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Mail className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
                      <span className="truncate font-mono text-sm font-bold">
                        {mailbox.email}
                      </span>
                      <MailboxStatusBadge mailbox={mailbox} />
                    </div>

                    <div className="flex min-w-0 items-center gap-2">
                      {mailbox.ownerUserId ? (
                        <>
                          <span
                            className={cn(
                              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black',
                              avatarTone(mailbox.ownerUserId),
                            )}
                          >
                            {partnerInitial(owner?.displayName ?? '?')}
                          </span>
                          <span className="truncate text-sm font-semibold">
                            {owner?.displayName ?? "o'chirilgan"}
                          </span>
                        </>
                      ) : (
                        <span className="text-sm font-semibold text-muted-foreground">
                          biriktirilmagan
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold text-muted-foreground">
                      {formatListingDate(mailbox.createdAt)}
                      {mailbox.tradeId && (
                        <span className="hidden font-mono text-xs text-muted-foreground/60 xl:inline">
                          #{mailbox.tradeId.slice(0, 8)}
                        </span>
                      )}
                    </div>

                    <ChevronRight className="hidden h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary md:block" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function ActiveFilterPill({
  icon,
  label,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 py-1 pl-2.5 pr-2 text-xs font-semibold text-muted-foreground transition hover:border-destructive/40 hover:text-foreground"
    >
      {icon}
      <span className="max-w-[220px] truncate">{label}</span>
      <X className="h-3.5 w-3.5" />
    </Link>
  );
}

function buildRemoveOwnerHref(search: string | undefined, filter: MailboxFilter) {
  const query = new URLSearchParams();
  if (search) query.set('search', search);
  if (filter !== 'all') query.set('filter', filter);
  const qs = query.toString();
  return qs ? `/admin/mailboxes?${qs}` : '/admin/mailboxes';
}

function buildRemoveSearchHref(ownerUserId: string | undefined, filter: MailboxFilter) {
  const query = new URLSearchParams();
  if (ownerUserId) query.set('ownerUserId', ownerUserId);
  if (filter !== 'all') query.set('filter', filter);
  const qs = query.toString();
  return qs ? `/admin/mailboxes?${qs}` : '/admin/mailboxes';
}
