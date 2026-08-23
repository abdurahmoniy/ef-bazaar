import Link from 'next/link';
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Fingerprint,
  Handshake,
  Inbox,
  MailCheck,
  Paperclip,
  ShoppingBag,
  UserRound,
} from 'lucide-react';

import { MailboxDeleteButton } from '@/components/admin/mailbox-delete-button';
import { MailboxPasswordReveal } from '@/components/admin/mailbox-password-reveal';
import { MailboxStatusBadge } from '@/components/admin/mailbox-status-badge';
import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import { ListingsPagination } from '@/components/marketplace/listings-pagination';
import { avatarTone, partnerInitial } from '@/lib/chat-format';
import {
  getAdminMailbox,
  getAdminMailboxInbox,
  getAdminMailboxSummary,
  getUsersByIds,
} from '@/lib/mailbox-admin-server';
import { formatListingDate } from '@/lib/marketplace-format';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

interface AdminMailboxPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ page?: string }>;
}

export default async function AdminMailboxPage({ params, searchParams }: AdminMailboxPageProps) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const page = Math.max(0, Number.parseInt(query.page ?? '0', 10) || 0);

  const mailboxResult = await getAdminMailbox(id);
  if (!mailboxResult.ok) {
    return <ApiErrorPanel title="Pochta topilmadi" error={mailboxResult.error} />;
  }
  const mailbox = mailboxResult.data;

  // Both hit IMAP and both may fail independently of the row itself — the
  // metadata card must still render when Mailcow is down.
  const [summaryResult, inboxResult, owners] = await Promise.all([
    getAdminMailboxSummary(id),
    getAdminMailboxInbox(id, PAGE_SIZE, page * PAGE_SIZE),
    getUsersByIds([mailbox.ownerUserId, mailbox.createdByAdminId].filter(Boolean) as string[]),
  ]);

  const owner = mailbox.ownerUserId ? owners.get(mailbox.ownerUserId) : undefined;
  const createdByAdmin = mailbox.createdByAdminId
    ? owners.get(mailbox.createdByAdminId)
    : undefined;
  const summary = summaryResult.ok ? summaryResult.data : null;

  return (
    <div className="space-y-5">
      <Link
        href={
          mailbox.ownerUserId
            ? `/admin/mailboxes?ownerUserId=${mailbox.ownerUserId}`
            : '/admin/mailboxes'
        }
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Pochtalar
      </Link>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-5 py-4">
          <div className="min-w-0 space-y-1.5">
            <h1 className="truncate font-mono text-lg font-black">{mailbox.email}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <MailboxStatusBadge mailbox={mailbox} />
              {summary?.unreadCount != null && summary.unreadCount > 0 && (
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-black text-primary">
                  {summary.unreadCount} o&apos;qilmagan
                </span>
              )}
            </div>
            {/* The password the mailbox has now, which is not the one announced
                when it was created: handing it over at the end of a trade
                rotates it. */}
            <div className="flex flex-wrap items-start gap-3 pt-1">
              <MailboxPasswordReveal mailboxId={mailbox.id} />
              <MailboxDeleteButton
                mailboxId={mailbox.id}
                email={mailbox.email}
                ownerUserId={mailbox.ownerUserId}
                tradeId={mailbox.tradeId}
                deletedAt={mailbox.deletedAt}
              />
            </div>
          </div>

          {mailbox.ownerUserId && (
            <Link
              href={`/admin/mailboxes?ownerUserId=${mailbox.ownerUserId}`}
              className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 transition hover:border-primary/40"
            >
              <span
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-xs font-black',
                  avatarTone(mailbox.ownerUserId),
                )}
              >
                {partnerInitial(owner?.displayName ?? '?')}
              </span>
              <span className="space-y-0.5">
                <span className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Egasi
                </span>
                <span className="block text-sm font-black">
                  {owner?.displayName ?? "o'chirilgan foydalanuvchi"}
                </span>
              </span>
            </Link>
          )}
        </header>

        <dl className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
          <Fact
            icon={<ShoppingBag className="h-4 w-4" />}
            label="Manba"
            value={
              mailbox.source === 'ADMIN'
                ? `Admin panel${createdByAdmin ? ` · ${createdByAdmin.displayName}` : ''}`
                : 'Savdo (escrow)'
            }
          />
          <Fact
            icon={<CalendarClock className="h-4 w-4" />}
            label="Yaratilgan"
            value={formatListingDate(mailbox.createdAt)}
          />
          <Fact
            icon={<MailCheck className="h-4 w-4" />}
            label="Mailcow tasdiqlagan"
            value={
              mailbox.provisionedAt ? formatListingDate(mailbox.provisionedAt) : 'kutilmoqda'
            }
            muted={!mailbox.provisionedAt}
          />
          <Fact
            icon={<Handshake className="h-4 w-4" />}
            label="Egasiga o'tgan"
            value={mailbox.handedOffAt ? formatListingDate(mailbox.handedOffAt) : '—'}
            muted={!mailbox.handedOffAt}
          />
          <Fact
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Oxirgi xat"
            value={
              summary?.lastActivityAt ? formatListingDate(summary.lastActivityAt) : '—'
            }
            muted={!summary?.lastActivityAt}
          />
          <Fact
            icon={<Fingerprint className="h-4 w-4" />}
            label={mailbox.tradeId ? 'Savdo ID' : 'Mailbox ID'}
            value={
              <code className="text-xs">{mailbox.tradeId ?? mailbox.id}</code>
            }
          />
        </dl>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-black">
            <Inbox className="h-4 w-4" />
            Kelgan xatlar
          </h2>
          {inboxResult.ok && (
            <span className="text-sm font-semibold text-muted-foreground">
              {inboxResult.data.total} ta
            </span>
          )}
        </div>

        {!inboxResult.ok ? (
          <ApiErrorPanel title="Xatlar yuklanmadi" error={inboxResult.error} />
        ) : inboxResult.data.messages.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/40 py-16 text-center">
            <div className="rounded-full bg-muted p-3">
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-muted-foreground">
              {mailbox.provisionedAt
                ? 'Bu qutiga hali xat kelmagan'
                : 'Pochta hali Mailcow tomonidan tasdiqlanmagan'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
              <ul className="divide-y divide-border">
                {inboxResult.data.messages.map((message) => (
                  <li key={message.messageId}>
                    <Link
                      href={`/admin/mailboxes/${mailbox.id}/messages/${message.messageId}`}
                      className="group flex items-start gap-3 px-4 py-3 transition hover:bg-accent/40"
                    >
                      <span
                        className={cn(
                          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                          message.seen ? 'bg-transparent' : 'bg-primary',
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              'truncate text-sm',
                              message.seen ? 'font-semibold' : 'font-black',
                            )}
                          >
                            {message.subject || '(mavzusiz)'}
                          </span>
                          {message.hasAttachments && (
                            <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          )}
                        </div>
                        <p className="truncate text-xs font-semibold text-muted-foreground">
                          {message.fromName || message.fromAddress}
                          {message.snippet ? ` — ${message.snippet}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-muted-foreground">
                        {formatListingDate(message.receivedAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <ListingsPagination
              page={page}
              totalPages={Math.ceil(inboxResult.data.total / PAGE_SIZE)}
              buildHref={(target) => `/admin/mailboxes/${mailbox.id}?page=${target}`}
            />
          </>
        )}
      </section>
    </div>
  );
}

function Fact({
  icon,
  label,
  value,
  muted,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 bg-card px-5 py-3.5">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0 space-y-0.5">
        <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </dt>
        <dd
          className={cn(
            'truncate text-sm font-semibold',
            muted && 'text-muted-foreground',
          )}
        >
          {value}
        </dd>
      </div>
    </div>
  );
}
