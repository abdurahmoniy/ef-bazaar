'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { avatarTone, partnerInitial, partnerName } from '@/lib/chat-format';
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

  return (
    <Link
      href={`/chats/${chat.id}`}
      className={cn(
        'flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition',
        'hover:bg-accent/60',
        active ? 'bg-accent' : 'bg-transparent',
      )}
    >
      <div
        className={cn(
          'grid h-11 w-11 shrink-0 place-items-center rounded-full text-[15px] font-bold uppercase',
          avatarTone(partnerId),
        )}
      >
        {partnerInitial(name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={cn(
              'truncate text-sm text-foreground',
              unread > 0 ? 'font-black' : 'font-bold',
            )}
          >
            {name}
          </p>
          {chat.important && <Badge variant="warn">Muhim</Badge>}
          <span className="ml-auto shrink-0 text-[10.5px] text-muted-foreground">
            {formatListingDate(stamp)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <p
            className={cn(
              'truncate text-[11px]',
              unread > 0 ? 'font-semibold text-foreground' : 'text-muted-foreground',
            )}
          >
            {chat.lastMessagePreview ?? "Hali xabar yo'q"}
          </p>
          {unread > 0 && (
            <span className="ml-auto grid min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[10.5px] font-bold leading-5 text-primary-foreground">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
