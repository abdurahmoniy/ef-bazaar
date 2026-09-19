'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Pin } from 'lucide-react';
import { LinkPendingIndicator } from '@/components/navigation/link-pending-indicator';

import { avatarTone, formatDayLabel, formatMessageTime, partnerInitial, partnerName, uzDayKey } from '@/lib/chat-format';
import { formatListingDate } from '@/lib/marketplace-format';
import type { ChatResponse } from '@/lib/marketplace-types';
import { cn } from '@/lib/utils';

interface ChatListItemProps {
  chat: ChatResponse;
  viewerId: string;
}

export function ChatListItem({ chat, viewerId }: ChatListItemProps) {
  const pathname = usePathname();
  const active = pathname === `/chats/${chat.id}`;
  const name = partnerName(chat, viewerId);
  const partnerId = chat.sellerId === viewerId ? chat.buyerId : chat.sellerId;
  const stamp = chat.lastMessageAt ?? chat.createdAt;
  const unread = chat.unreadCount ?? 0;
  const timeLabel = uzDayKey(stamp) === uzDayKey(new Date()) ? formatMessageTime(stamp) : formatDayLabel(stamp);

  return (
    <Link
      href={`/chats/${chat.id}`}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex min-h-20 items-center gap-3 px-4 py-3 text-left transition-colors after:absolute after:bottom-0 after:left-[5.25rem] after:right-4 after:h-px after:bg-border/40',
        'hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        active ? 'bg-primary/10 dark:bg-sky-400/10' : 'bg-transparent',
      )}
    >
      <div
        className={cn(
          'relative grid h-14 w-14 shrink-0 place-items-center rounded-full text-xl font-semibold uppercase',
          avatarTone(partnerId),
        )}
      >
        <span aria-hidden>{partnerInitial(name)}</span>
        <LinkPendingIndicator className="absolute -bottom-0.5 -right-0.5 h-7 w-7 rounded-full bg-card text-primary shadow-sm dark:text-sky-300" iconClassName="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={cn(
              'min-w-0 flex-1 truncate text-[15px] leading-5 text-foreground',
              unread > 0 ? 'font-bold' : 'font-semibold',
            )}
          >
            {name}
          </p>
          <time dateTime={stamp} title={formatListingDate(stamp)} className={cn('ml-auto shrink-0 text-[11px] tabular-nums', unread > 0 ? 'font-medium text-primary dark:text-sky-300' : 'text-muted-foreground')}>
            {timeLabel}
          </time>
        </div>
        <div className="mt-1 flex min-h-5 items-center gap-2">
          <p
            className={cn(
              'min-w-0 flex-1 truncate text-[13px] leading-5',
              unread > 0 ? 'text-foreground/85' : 'text-muted-foreground',
            )}
          >
            {chat.lastMessagePreview ?? "Hali xabar yo'q"}
          </p>
          {chat.important && (
            <span className="shrink-0 text-muted-foreground" title="Muhim">
              <Pin aria-hidden className="h-3.5 w-3.5 rotate-45" />
              <span className="sr-only">Muhim</span>
            </span>
          )}
          {unread > 0 && (
            <span aria-label={`${unread} ta o'qilmagan xabar`} className="ml-auto grid min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 tabular-nums text-primary-foreground dark:bg-sky-300 dark:text-slate-950">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
