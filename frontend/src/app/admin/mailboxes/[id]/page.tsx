import Link from 'next/link';
import { ArrowLeft, Inbox, Paperclip } from 'lucide-react';

import { MailboxStatusBadge } from '@/components/admin/mailbox-status-badge';
import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import { ListingsPagination } from '@/components/marketplace/listings-pagination';
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
    <div className="space-y-4">
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

      <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-black">{mailbox.email}</h1>
          <MailboxStatusBadge mailbox={mailbox} />
        </div>

        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Row label="Egasi">
            {mailbox.ownerUserId ? (
              <Link
                href={`/admin/mailboxes?ownerUserId=${mailbox.ownerUserId}`}
                className="font-semibold text-primary hover:underline"
              >
                {owner?.displayName ?? "o'chirilgan foydalanuvchi"}
              </Link>
            ) : (
              <span className="text-muted-foreground">biriktirilmagan</span>
            )}
          </Row>
          <Row label="Manba">
            {mailbox.source === 'ADMIN' ? 'Admin panel' : 'Savdo (escrow)'}
            {createdByAdmin ? ` · ${createdByAdmin.displayName}` : ''}
          </Row>
          <Row label="Yaratilgan">{formatListingDate(mailbox.createdAt)}</Row>
          <Row label="Mailcow tasdiqlagan">
            {mailbox.provisionedAt ? formatListingDate(mailbox.provisionedAt) : 'kutilmoqda'}
          </Row>
          <Row label="Egasiga o'tgan">
            {mailbox.handedOffAt ? formatListingDate(mailbox.handedOffAt) : '—'}
          </Row>
          <Row label="Savdo">
            {mailbox.tradeId ? (
              <code className="text-xs">{mailbox.tradeId}</code>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </Row>
          <Row label="O'qilmagan">
            {summary?.unreadCount ?? '—'}
            {summary?.lastActivityAt
              ? ` · oxirgi xat ${formatListingDate(summary.lastActivityAt)}`
              : ''}
          </Row>
          <Row label="ID">
            <code className="text-xs">{mailbox.id}</code>
          </Row>
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-black">
          <Inbox className="h-4 w-4" />
          Kelgan xatlar
          {inboxResult.ok && (
            <span className="font-semibold text-muted-foreground">
              ({inboxResult.data.total})
            </span>
          )}
        </h2>

        {!inboxResult.ok ? (
          <ApiErrorPanel title="Xatlar yuklanmadi" error={inboxResult.error} />
        ) : inboxResult.data.messages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm font-semibold text-muted-foreground">
            {mailbox.provisionedAt
              ? 'Xat yo‘q'
              : 'Pochta hali Mailcow tomonidan tasdiqlanmagan'}
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {inboxResult.data.messages.map((message) => (
                <li key={message.messageId}>
                  <Link
                    href={`/admin/mailboxes/${mailbox.id}/messages/${message.messageId}`}
                    className={cn(
                      'flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-card transition hover:border-primary/50',
                      !message.seen && 'border-primary/40',
                    )}
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn('text-sm', message.seen ? 'font-semibold' : 'font-black')}
                        >
                          {message.subject || '(mavzusiz)'}
                        </span>
                        {message.hasAttachments && (
                          <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </div>
                      <p className="truncate text-xs font-semibold text-muted-foreground">
                        {message.fromName || message.fromAddress} · {message.snippet}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                      {formatListingDate(message.receivedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}
