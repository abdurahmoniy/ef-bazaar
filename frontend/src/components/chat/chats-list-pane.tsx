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
  const [showSearch, setShowSearch] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

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
    <section className="flex h-full min-h-0 flex-col bg-background pt-[env(safe-area-inset-top)] md:pt-0">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-card px-3 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] md:pt-2">
        <Button asChild variant="ghost" size="sm" className="-ml-1 h-9 w-9 p-0">
          <Link href="/marketplace" aria-label="Bozorga qaytish" title="Bozorga qaytish">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-base font-black text-foreground">Chatlar</h1>
        <div className="ml-auto flex items-center gap-1">
          <NotificationBell dropdownAlign="left" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0"
            onClick={() => setShowSearch((v) => !v)}
            aria-label={showSearch ? 'Qidiruvni yopish' : 'Qidirish'}
          >
            {showSearch ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      {showSearch && (
        <div className="border-b border-border bg-card px-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ismi bo'yicha qidirish..."
              className="h-10 pl-9"
            />
          </div>
        </div>
      )}

      <div className="flex gap-1.5 overflow-x-auto border-b border-border bg-card px-3 py-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition',
              filter === f.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {filtered.length === 0 ? (
          <EmptyState hasChats={chats.length > 0} filter={filter} query={query} />
        ) : (
          <div className="space-y-0.5">
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
