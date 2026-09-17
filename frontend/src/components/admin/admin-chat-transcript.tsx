import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Handshake, Layers } from 'lucide-react';

import { MessageAttachment } from '@/components/chat/message-attachment';
import {
  PARTY_LABEL_UZ, PROPOSAL_OUTCOME_LABEL_UZ, buildAdminChatTimeline, partyName, partyOf,
} from '@/lib/chat-admin';
import type { AdminChatListingEvent, AdminChatResponse } from '@/lib/chat-admin-types';
import type { MessageResponse } from '@/lib/marketplace-types';
import { formatDayLabel, formatMessageTime, uzDayKey } from '@/lib/chat-format';
import { formatPriceUZS } from '@/lib/marketplace-format';
import { listingMediaUrl } from '@/lib/marketplace-media';
import { cn } from '@/lib/utils';

interface AdminChatTranscriptProps {
  chat: AdminChatResponse;
  messages: MessageResponse[];
  listings: AdminChatListingEvent[];
  oldestPage: boolean;
}

/** Read-only messages with saved listing selections inserted at their message anchors. */
export function AdminChatTranscript({ chat, messages, listings, oldestPage }: AdminChatTranscriptProps) {
  const timeline = buildAdminChatTimeline(messages, listings, oldestPage);
  return (
    <>
      <ol className="space-y-1.5">
        {timeline.map((item, index) => {
          const previous = timeline[index - 1];
          const newDay = !previous || uzDayKey(previous.createdAt) !== uzDayKey(item.createdAt);
          const showName = newDay || previous?.type !== 'message' || (item.type === 'message' && previous.senderId !== item.senderId);
          return (
            <li key={`${item.type}:${item.id}`}>
              {newDay && (
                <div className="my-3 flex justify-center" role="separator">
                  <span className="rounded-full bg-muted px-3 py-1 text-[10.5px] font-bold text-muted-foreground">
                    {formatDayLabel(item.createdAt)}
                  </span>
                </div>
              )}
              {item.type === 'listing'
                ? <ListingEventCard event={item} chat={chat} />
                : <TranscriptMessage message={item} chat={chat} showName={showName} />}
            </li>
          );
        })}
      </ol>
      {messages.length === 0 && (
        <p className="p-6 text-center text-sm text-muted-foreground">Bu chatda xabar yo&apos;q.</p>
      )}
    </>
  );
}

function ListingEventCard({ event, chat }: { event: AdminChatListingEvent; chat: AdminChatResponse }) {
  const listing = event.listing;
  const cover = listing?.coverMessageId ? listingMediaUrl(listing.coverMessageId) : null;
  const requester = partyOf(chat, event.requesterId);
  const label = event.initial ? 'Suhbat boshlangan e’lon'
    : requester ? `${partyName(chat, requester)} tanlagan e’lon` : 'E’lon tanlandi';
  const canOpen = listing && listing.status !== 'DELETED';
  const title = listing?.description.split('\n')[0]?.trim() || 'E’lon ma’lumotlari mavjud emas';
  const details = (
    <>
      {cover && <Image src={cover} alt="" width={64} height={64} unoptimized className="h-16 w-16 shrink-0 rounded-lg bg-muted object-cover" />}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 break-words text-sm font-semibold text-foreground">{title}</p>
        {listing ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-bold text-primary">{formatPriceUZS(listing.price)}</span>
            <span className="text-xs text-muted-foreground">
              {listing.status === 'SOLD' ? 'Sotilgan' : listing.status === 'DELETED' ? 'O‘chirilgan' : 'Sotuvda'}
            </span>
          </div>
        ) : <p className="mt-1 text-xs text-muted-foreground">ID: {event.listingId.slice(0, 8)}</p>}
      </div>
      {canOpen && <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
    </>
  );
  return (
    <div className="mx-auto my-3 max-w-md rounded-xl border border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1 break-words font-medium">{label}</p>
        <time dateTime={event.createdAt} className="shrink-0 tabular-nums">{formatMessageTime(event.createdAt)}</time>
      </div>
      {canOpen ? (
        <Link href={`/marketplace/${event.listingId}`} className="flex min-h-11 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:opacity-80">
          {details}
        </Link>
      ) : <div className="flex items-center gap-3">{details}</div>}
    </div>
  );
}

function TranscriptMessage({ message, chat, showName }: { message: MessageResponse; chat: AdminChatResponse; showName: boolean }) {
  const party = partyOf(chat, message.senderId);
  const seller = party === 'SELLER';
  const hasAttachment = Boolean(message.attachmentType && message.attachmentFileId);
  return (
    <>
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
    </>
  );
}
