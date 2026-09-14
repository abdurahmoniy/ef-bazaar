import Link from 'next/link';
import { ArrowLeft, EyeOff, Handshake } from 'lucide-react';

import { MessageAttachment } from '@/components/chat/message-attachment';
import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import {
  PARTY_LABEL_UZ,
  PROPOSAL_OUTCOME_LABEL_UZ,
  chronological,
  parsePage,
  partyName,
  partyOf,
} from '@/lib/chat-admin';
import { getAdminChat, getAdminChatMessages } from '@/lib/chat-admin-server';
import { formatDayLabel, formatMessageTime, uzDayKey } from '@/lib/chat-format';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface AdminChatPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ page?: string }>;
}

/**
 * One conversation, read-only. The seller sits on the right, the buyer on the
 * left. There is no composer and nothing here is interactive beyond media
 * playback, so an admin cannot act in the chat even by accident.
 *
 * Page 0 is the latest messages; "Oldingi xabarlar" walks back in time.
 */
export default async function AdminChatPage({ params, searchParams }: AdminChatPageProps) {
  const { id } = await params;
  const page = parsePage((searchParams ? await searchParams : {}).page);

  const [chatResult, messagesResult] = await Promise.all([
    getAdminChat(id),
    getAdminChatMessages(id, page),
  ]);
  if (!chatResult.ok) {
    return <ApiErrorPanel title="Chat topilmadi" error={chatResult.error} />;
  }
  if (!messagesResult.ok) {
    return <ApiErrorPanel title="Xabarlar yuklanmadi" error={messagesResult.error} />;
  }
  const chat = chatResult.data;
  const { totalPages } = messagesResult.data;
  const messages = chronological(messagesResult.data.content);
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

        {messages.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Bu chatda xabar yo&apos;q.</p>
        ) : (
          <ol className="space-y-1.5">
            {messages.map((message, index) => {
              const previous = messages[index - 1];
              const newDay = !previous || uzDayKey(previous.createdAt) !== uzDayKey(message.createdAt);
              const party = partyOf(chat, message.senderId);
              const seller = party === 'SELLER';
              const showName = newDay || !previous || previous.senderId !== message.senderId;
              const hasAttachment = Boolean(message.attachmentType && message.attachmentFileId);

              return (
                <li key={message.id}>
                  {newDay && (
                    <div className="my-3 flex justify-center" role="separator">
                      <span className="rounded-full bg-muted px-3 py-1 text-[10.5px] font-bold text-muted-foreground">
                        {formatDayLabel(message.createdAt)}
                      </span>
                    </div>
                  )}

                  {message.messageType === 'TRADE_PROPOSAL' ? (
                    <div className="my-2 flex justify-center">
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground">
                        <Handshake className="h-3.5 w-3.5" aria-hidden="true" />
                        {party ? `${partyName(chat, party)}: savdo taklifi` : 'Savdo taklifi'}
                        {message.proposalOutcome && ` — ${PROPOSAL_OUTCOME_LABEL_UZ[message.proposalOutcome]}`}
                        <span>· {formatMessageTime(message.createdAt)}</span>
                      </span>
                    </div>
                  ) : (
                    <div className={cn('flex flex-col', seller ? 'items-end' : 'items-start')}>
                      {showName && (
                        <span className="mb-0.5 px-1 text-[11px] font-bold text-muted-foreground">
                          {party ? partyName(chat, party) : 'Tizim'}
                          {party && <span className="font-normal"> · {PARTY_LABEL_UZ[party]}</span>}
                        </span>
                      )}
                      <div
                        className={cn(
                          'max-w-[80%] rounded-2xl text-sm whitespace-pre-wrap break-words',
                          hasAttachment && message.attachmentType === 'IMAGE' ? 'p-1' : 'px-3 py-2',
                          seller
                            ? 'rounded-br-md bg-primary text-primary-foreground'
                            : 'rounded-bl-md bg-muted text-foreground',
                        )}
                      >
                        {message.replyToId && (
                          <span
                            className={cn(
                              'mb-1 block rounded-lg border-l-2 px-2 py-1 text-[11.5px]',
                              seller
                                ? 'border-primary-foreground/60 bg-white/10 text-primary-foreground/90'
                                : 'border-primary bg-primary/5 text-muted-foreground',
                            )}
                          >
                            {message.replySenderId && (
                              <span className="block font-bold">
                                {(() => {
                                  const quoted = partyOf(chat, message.replySenderId);
                                  return quoted ? partyName(chat, quoted) : '';
                                })()}
                              </span>
                            )}
                            <span className="block truncate">{message.replyPreview ?? "O'chirilgan xabar"}</span>
                          </span>
                        )}
                        {hasAttachment && <MessageAttachment message={message} mine={seller} />}
                        {message.content && (
                          <span className={cn('block', hasAttachment && 'px-2 pb-1 pt-1.5')}>
                            {message.content}
                          </span>
                        )}
                      </div>
                      <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">
                        {formatMessageTime(message.createdAt)}
                        {message.editedAt && ' · tahrirlangan'}
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}

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
