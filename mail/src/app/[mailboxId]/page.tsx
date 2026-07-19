import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';

import { CopyButton } from '@/components/mail/copy-button';
import { InboxView } from '@/components/mail/inbox-view';
import { MailShell } from '@/components/mail/mail-shell';
import { RefreshControls } from '@/components/mail/refresh-controls';
import { getMe } from '@/lib/auth';
import { mailAvatarColor, mailAvatarInitial } from '@/lib/mail-format';
import { getInbox, getMyMailboxes } from '@/lib/mail-server';
import { mainSiteLoginUrl } from '@/lib/site';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pochta',
};

const PAGE_SIZE = 50;

interface InboxPageProps {
  params: Promise<{ mailboxId: string }>;
  searchParams?: Promise<{ offset?: string }>;
}

export default async function InboxPage({ params, searchParams }: InboxPageProps) {
  const { mailboxId } = await params;
  const search = (searchParams ? await searchParams : {}) as { offset?: string };
  const offset = Math.max(0, Number.parseInt(search.offset ?? '0', 10) || 0);

  const user = await getMe();
  if (!user) redirect(mainSiteLoginUrl(`/${mailboxId}`));

  const mailboxes = await getMyMailboxes();
  const active = mailboxes.find((m) => m.id === mailboxId);
  if (!active) notFound();

  const page = await getInbox(mailboxId, { limit: PAGE_SIZE, offset });

  const unread = active.unreadCount;
  const summary = page
    ? `Jami ${page.total} xat${typeof unread === 'number' && unread > 0 ? ` · ${unread} o'qilmagan` : ''}`
    : 'Yangilashda xatolik';

  return (
    <MailShell mailboxes={mailboxes} activeMailboxId={mailboxId}>
      <div className="flex min-h-full flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="hidden h-10 w-10 shrink-0 place-items-center rounded-full text-base font-black text-white shadow-sm sm:grid"
              style={{ backgroundColor: mailAvatarColor(active.email) }}
              aria-hidden
            >
              {mailAvatarInitial(active.email)}
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1">
                <h1 className="truncate text-base font-black text-foreground">{active.email}</h1>
                <CopyButton value={active.email} label="Pochta manzilini nusxalash" />
              </div>
              <p className="text-xs text-muted-foreground">{summary}</p>
            </div>
          </div>
          <RefreshControls />
        </div>

        {page === null ? (
          <ImapError />
        ) : (
          <>
            <InboxView
              mailboxId={mailboxId}
              mailboxEmail={active.email}
              messages={page.messages}
              emptySlice={offset > 0 && page.messages.length === 0}
            />
            {(offset > 0 || page.messages.length === PAGE_SIZE) && (
              <PaginationBar
                mailboxId={mailboxId}
                offset={offset}
                total={page.total}
                pageSize={PAGE_SIZE}
              />
            )}
          </>
        )}
      </div>
    </MailShell>
  );
}

function ImapError() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </span>
      <p className="mt-4 text-sm font-bold text-destructive">Xatlarni olishda xatolik</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
        Serverga vaqtincha ulanib bo&apos;lmadi. Bir daqiqadan keyin qayta urinib ko&apos;ring.
      </p>
    </div>
  );
}

function PaginationBar({
  mailboxId,
  offset,
  total,
  pageSize,
}: {
  mailboxId: string;
  offset: number;
  total: number;
  pageSize: number;
}) {
  const hasPrev = offset > 0;
  const hasNext = offset + pageSize < total;
  const prevOffset = Math.max(0, offset - pageSize);
  const nextOffset = offset + pageSize;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(total, offset + pageSize);

  return (
    <div className="mt-auto flex shrink-0 items-center justify-between border-t border-border bg-card px-4 py-2 sm:px-6">
      <span className="text-xs tabular-nums text-muted-foreground">
        {from}–{to} / {total}
      </span>
      <div className="flex items-center gap-1">
        <PageArrow
          href={hasPrev ? `/${mailboxId}${prevOffset > 0 ? `?offset=${prevOffset}` : ''}` : null}
          label="Oldingi sahifa"
        >
          <ChevronLeft className="h-4 w-4" />
        </PageArrow>
        <PageArrow href={hasNext ? `/${mailboxId}?offset=${nextOffset}` : null} label="Keyingi sahifa">
          <ChevronRight className="h-4 w-4" />
        </PageArrow>
      </div>
    </div>
  );
}

function PageArrow({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
}) {
  const cls = cn(
    'inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors',
    href ? 'hover:bg-muted hover:text-foreground' : 'pointer-events-none opacity-30',
  );
  if (!href) return <span className={cls}>{children}</span>;
  return (
    <Link href={href} title={label} aria-label={label} className={cls}>
      {children}
    </Link>
  );
}
