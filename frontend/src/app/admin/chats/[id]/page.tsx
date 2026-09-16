import Link from 'next/link';
import { ArrowLeft, EyeOff } from 'lucide-react';

import { AdminChatTranscript } from '@/components/admin/admin-chat-transcript';
import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import { parsePage, partyName } from '@/lib/chat-admin';
import { getAdminChat, getAdminChatListingHistory, getAdminChatMessages } from '@/lib/chat-admin-server';

export const dynamic = 'force-dynamic';

interface AdminChatPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ page?: string }>;
}

/**
 * One conversation, read-only. The seller sits on the right, the buyer on the
 * left. There is no composer and nothing here is interactive beyond media
 * playback and listing links, so an admin cannot act in the chat by accident.
 *
 * Page 0 is the latest messages; "Oldingi xabarlar" walks back in time.
 */
export default async function AdminChatPage({ params, searchParams }: AdminChatPageProps) {
  const { id } = await params;
  const page = parsePage((searchParams ? await searchParams : {}).page);

  const [chatResult, messagesResult, listingsResult] = await Promise.all([
    getAdminChat(id),
    getAdminChatMessages(id, page),
    getAdminChatListingHistory(id),
  ]);
  if (!chatResult.ok) {
    return <ApiErrorPanel title="Chat topilmadi" error={chatResult.error} />;
  }
  if (!messagesResult.ok) {
    return <ApiErrorPanel title="Xabarlar yuklanmadi" error={messagesResult.error} />;
  }
  const chat = chatResult.data;
  const { totalPages } = messagesResult.data;
  const hasOlder = page + 1 < totalPages;

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <Link
        href="/admin/chats"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Chatlar
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3">
        <div className="min-w-0 text-sm">
          <p className="text-foreground">
            <span className="text-muted-foreground">Oluvchi: </span>
            <span className="font-bold">{partyName(chat, 'BUYER')}</span>
          </p>
          <p className="text-foreground">
            <span className="text-muted-foreground">Sotuvchi: </span>
            <span className="font-bold">{partyName(chat, 'SELLER')}</span>
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
          <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
          Anonim · faqat o&apos;qish
        </span>
      </header>

      <section className="rounded-xl border border-border bg-card px-3 py-4" aria-label="Yozishma">
        {hasOlder && (
          <PageLink href={`/admin/chats/${chat.id}?page=${page + 1}`} label="Oldingi xabarlar" />
        )}

        {!listingsResult.ok && <ApiErrorPanel title="E’lonlar tarixi yuklanmadi" error={listingsResult.error} />}
        <AdminChatTranscript
          chat={chat}
          messages={messagesResult.data.content}
          listings={listingsResult.ok ? listingsResult.data : []}
          oldestPage={!hasOlder}
        />

        {page > 0 && (
          <PageLink href={`/admin/chats/${chat.id}?page=${page - 1}`} label="Yangiroq xabarlar" />
        )}
      </section>
    </div>
  );
}

function PageLink({ href, label }: { href: string; label: string }) {
  return (
    <div className="my-2 flex justify-center">
      <Link
        href={href}
        className="rounded-full border border-border px-3 py-1 text-xs font-bold text-foreground transition hover:bg-muted"
      >
        {label}
      </Link>
    </div>
  );
}
