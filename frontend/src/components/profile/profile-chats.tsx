import Link from 'next/link';
import { MessageCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { formatListingDate } from '@/lib/marketplace-format';
import type { ChatResponse } from '@/lib/marketplace-types';

interface ProfileChatsProps {
  chats: ChatResponse[];
  viewerId: string;
}

export function ProfileChats({ chats, viewerId }: ProfileChatsProps) {
  if (chats.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-4 py-12 text-center shadow-card">
        <MessageCircle className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <h2 className="mt-2 text-sm font-bold text-foreground">Chatlar yo'q</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Sotuvchi bilan bog'lanish uchun bozorda "Sotuvchi bilan bog'lanish" tugmasini bosing.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {chats.map((chat) => {
        const isSeller = chat.sellerId === viewerId;
        return (
          <Link
            key={chat.id}
            href={`/chats/${chat.id}`}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-card transition hover:border-primary/40 hover:shadow-card-hover"
          >
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-bold text-foreground">
                  Chat #{chat.id.slice(0, 6)}
                </p>
                {chat.important && <Badge variant="warn">Muhim</Badge>}
                {chat.status !== 'ACTIVE' && (
                  <Badge variant="muted" className="uppercase">
                    {chat.status.toLowerCase()}
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {isSeller ? 'Sotuvchi sifatida' : 'Xaridor sifatida'} •{' '}
                {chat.lastMessageAt ? formatListingDate(chat.lastMessageAt) : formatListingDate(chat.createdAt)} •{' '}
                {chat.messageCount} xabar
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
