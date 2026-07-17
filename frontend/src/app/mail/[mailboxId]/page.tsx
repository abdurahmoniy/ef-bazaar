import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AlertTriangle, ChevronLeft, ChevronRight, RotateCw } from 'lucide-react';

import { InboxList } from '@/components/mail/inbox-list';
import { MailShell } from '@/components/mail/mail-shell';
import { Button } from '@/components/ui/button';
import { getMe } from '@/lib/auth';
import { getInbox, getMyMailboxes } from '@/lib/mail-server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pochta',
  robots: { index: false, follow: false },
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
  if (!user) redirect(`/auth/login?from=/mail/${mailboxId}`);

  const mailboxes = await getMyMailboxes();
  const active = mailboxes.find((m) => m.id === mailboxId);
  if (!active) notFound();

  const page = await getInbox(mailboxId, { limit: PAGE_SIZE, offset });

  return (
    <MailShell user={user} mailboxes={mailboxes} activeMailboxId={mailboxId}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-black text-foreground">{active.email}</h1>
            <p className="text-xs text-muted-foreground">
              {page ? `Jami ${page.total} xat` : 'Yangilashda xatolik'}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link
              href={`/mail/${mailboxId}${offset > 0 ? `?offset=${offset}` : ''}`}
              scroll={false}
              prefetch={false}
            >
              <RotateCw className="h-3.5 w-3.5" /> Yangilash
            </Link>
          </Button>
        </div>

        {page === null ? (
          <ImapError />
        ) : (
          <>
            <InboxList
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
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-8 text-center">
      <AlertTriangle className="mx-auto h-6 w-6 text-destructive" />
      <p className="mt-2 text-sm font-bold text-destructive">Xatlarni olishda xatolik</p>
      <p className="mt-1 text-xs text-muted-foreground">
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
    <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2 text-xs text-muted-foreground shadow-card">
      <span>
        {from}–{to} / {total}
      </span>
      <div className="flex items-center gap-1">
        <Button asChild variant="ghost" size="sm" disabled={!hasPrev}>
          <Link
            href={`/mail/${mailboxId}${prevOffset > 0 ? `?offset=${prevOffset}` : ''}`}
            aria-disabled={!hasPrev}
            className={!hasPrev ? 'pointer-events-none opacity-40' : undefined}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Oldingi
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" disabled={!hasNext}>
          <Link
            href={`/mail/${mailboxId}?offset=${nextOffset}`}
            aria-disabled={!hasNext}
            className={!hasNext ? 'pointer-events-none opacity-40' : undefined}
          >
            Keyingi
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
