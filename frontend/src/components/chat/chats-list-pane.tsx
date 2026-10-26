'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ChevronLeft, MessageCircle, Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChatListItem } from '@/components/chat/chat-list-item';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { partnerName } from '@/lib/chat-format';
import type { ChatResponse } from '@/lib/marketplace-types';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'unread' | 'important';

interface ChatsListPaneProps {
  chats: ChatResponse[];
  viewerId: string;
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Barchasi' },
  { id: 'unread', label: "O'qilmagan" },
  { id: 'important', label: 'Muhim' },
];

export function ChatsListPane({ chats, viewerId }: ChatsListPaneProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const unreadCount = chats.reduce((total, chat) => total + (chat.unreadCount ?? 0), 0);
  const counts: Record<Filter, number> = {
    all: chats.length,
    unread: chats.filter((chat) => (chat.unreadCount ?? 0) > 0).length,
    important: chats.filter((chat) => chat.important).length,
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return chats.filter((chat) => {
      if (filter === 'unread' && !(chat.unreadCount && chat.unreadCount > 0)) return false;
      if (filter === 'important' && !chat.important) return false;
      if (!q) return true;
      return partnerName(chat, viewerId).toLowerCase().includes(q);
    });
  }, [chats, query, filter, viewerId]);

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-card">
      <header className="relative z-30 flex shrink-0 items-center gap-2.5 bg-card px-4 py-3 pt-[calc(var(--app-content-safe-top)+0.75rem)] md:pt-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 h-10 w-10 rounded-full p-0">
          <Link href="/marketplace" aria-label="Bozorga qaytish" title="Bozorga qaytish">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Chatlar</h1>
        {unreadCount > 0 && (
          <span aria-label={`${unreadCount} ta o'qilmagan xabar`} className="rounded-full bg-info-soft px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <NotificationBell dropdownAlign="left" />
        </div>
      </header>

      <div className="shrink-0 px-4 pb-2" role="search">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Chatlarni qidirish"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ismi bo'yicha qidirish"
            className="h-11 rounded-full border-transparent bg-muted/70 pl-10 pr-10 text-sm shadow-none [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Qidiruvni tozalash" className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X aria-hidden className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div role="group" aria-label="Chat filtrlari" className="no-scrollbar flex shrink-0 gap-4 overflow-x-auto border-b border-border/60 px-4">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            aria-label={`${f.label}, ${counts[f.id]} ta chat`}
            className={cn(
              'relative flex min-h-11 shrink-0 items-center gap-1.5 px-0.5 text-[13px] font-semibold transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:rounded-t-full after:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              filter === f.id
                ? 'text-primary after:bg-info'
                : 'text-muted-foreground after:bg-transparent hover:text-foreground',
            )}
          >
            {f.label}
            {counts[f.id] > 0 && (
              <span aria-hidden className={cn('rounded-full px-1.5 text-[10px] leading-[18px] tabular-nums', filter === f.id ? 'bg-info-soft text-primary' : 'bg-muted text-muted-foreground')}>
                {counts[f.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1 md:pb-[calc(var(--app-content-safe-bottom)+0.5rem)]">
        {filtered.length === 0 ? (
          <EmptyState hasChats={chats.length > 0} filter={filter} query={query} />
        ) : (
          <div>
            {filtered.map((chat) => (
              <ChatListItem key={chat.id} chat={chat} viewerId={viewerId} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function EmptyState({
  hasChats,
  filter,
  query,
}: {
  hasChats: boolean;
  filter: Filter;
  query: string;
}) {
  if (!hasChats) {
    return (
      <div className="grid place-items-center px-4 py-12 text-center">
        <MessageCircle className="h-8 w-8 text-muted-foreground/50" />
        <h2 className="mt-3 text-sm font-bold text-foreground">Chatlar yo'q</h2>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          E'lonlardan birida "Sotuvchi bilan bog'lanish" tugmasini bosing.
        </p>
      </div>
    );
  }
  return (
    <div className="grid place-items-center px-4 py-10 text-center">
      <h2 className="text-sm font-bold text-foreground">Hech narsa topilmadi</h2>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">
        {query
          ? `"${query}" bo'yicha chat topilmadi.`
          : filter === 'important'
            ? "Muhim deb belgilangan chatlar yo'q."
            : filter === 'unread'
              ? "O'qilmagan xabarlar yo'q."
              : 'Filtrni o\'zgartirib ko\'ring.'}
      </p>
    </div>
  );
}
