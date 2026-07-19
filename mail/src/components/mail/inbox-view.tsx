'use client';

import { useMemo, useState } from 'react';
import { Search, SearchX, X } from 'lucide-react';

import { InboxList } from '@/components/mail/inbox-list';
import { cn } from '@/lib/utils';
import type { InboxMessage } from '@/lib/mail-types';

interface InboxViewProps {
  mailboxId: string;
  mailboxEmail: string;
  messages: InboxMessage[];
  emptySlice?: boolean;
}

/**
 * Client wrapper around the SSR-fetched inbox slice: instant text search
 * (sender / subject / snippet) and an unread-only toggle. Filtering is
 * client-side over the current page only — the backend has no search
 * endpoint, and one page (50) covers the practical case of "find the Konami
 * mail among the noise".
 */
export function InboxView({ mailboxId, mailboxEmail, messages, emptySlice }: InboxViewProps) {
  const [query, setQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const unreadCount = useMemo(() => messages.filter((m) => !m.seen).length, [messages]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return messages.filter((m) => {
      if (unreadOnly && m.seen) return false;
      if (!q) return true;
      return (
        m.subject.toLowerCase().includes(q) ||
        m.fromName.toLowerCase().includes(q) ||
        m.fromAddress.toLowerCase().includes(q) ||
        m.snippet.toLowerCase().includes(q)
      );
    });
  }, [messages, query, unreadOnly]);

  const isFiltering = query.trim().length > 0 || unreadOnly;

  return (
    <div className="space-y-3">
      {messages.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1 basis-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Shu sahifadan qidirish…"
              aria-label="Xatlar ichidan qidirish"
              className="h-9 w-full rounded-lg border border-border bg-white pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Qidiruvni tozalash"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={() => setUnreadOnly((v) => !v)}
            aria-pressed={unreadOnly}
            className={cn(
              'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors',
              unreadOnly
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-border bg-white text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            O&apos;qilmagan
            {unreadCount > 0 && (
              <span
                className={cn(
                  'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-black',
                  unreadOnly ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                )}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        </div>
      )}

      {isFiltering && filtered.length === 0 ? (
        <NoFilterMatch />
      ) : (
        <InboxList
          mailboxId={mailboxId}
          mailboxEmail={mailboxEmail}
          messages={filtered}
          emptySlice={emptySlice}
        />
      )}
    </div>
  );
}

function NoFilterMatch() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-4 py-12 text-center shadow-card">
      <SearchX className="mx-auto h-8 w-8 text-muted-foreground/50" />
      <h2 className="mt-2 text-sm font-bold text-foreground">Hech narsa topilmadi</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Qidiruv yoki filtrga mos xat shu sahifada yo&apos;q.
      </p>
    </div>
  );
}
