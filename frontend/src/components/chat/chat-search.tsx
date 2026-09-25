'use client';

import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { MessageResponse } from '@/lib/marketplace-types';

export interface ChatSearchProps {
  messages: MessageResponse[];
  onJump: (messageId: string) => void;
  onClose: () => void;
  loading?: boolean;
  error?: string | null;
}

export function ChatSearch({ messages, onJump, onClose, loading = false, error }: ChatSearchProps) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase('uz');
  const matches = useMemo(() => normalizedQuery ? messages.filter((message) =>
    message.content.toLocaleLowerCase('uz').includes(normalizedQuery)
    || message.attachmentName?.toLocaleLowerCase('uz').includes(normalizedQuery)) : [],
  [messages, normalizedQuery]);
  const selectedIndex = Math.max(0, matches.findIndex((message) => message.id === selectedId));
  const activeId = matches[selectedIndex]?.id;

  useEffect(() => {
    if (activeId) onJump(activeId);
  }, [activeId, onJump]);

  function navigate(direction: number) {
    if (!matches.length) return;
    const next = matches[(selectedIndex + direction + matches.length) % matches.length];
    if (next.id === activeId) onJump(next.id);
    else setSelectedId(next.id);
  }

  const status = loading ? 'Yuklanmoqda…' : normalizedQuery
    ? matches.length ? `${selectedIndex + 1} / ${matches.length}` : 'Natija topilmadi'
    : 'Xabarlarni qidirish';

  return <div className="chat-search border-b border-border bg-background px-3 py-2" role="search" aria-label="Chat ichida qidirish"
    onKeyDown={(event) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      } else if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
        event.preventDefault();
        navigate(event.shiftKey ? -1 : 1);
      }
    }}>
    <div className="flex min-w-0 items-center gap-2">
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <input autoFocus type="search" aria-label="Xabarlarni qidirish" placeholder="Xabarlarni qidirish…"
        className="chat-search-input min-w-0 flex-1 bg-transparent py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={query} onChange={(event) => { setQuery(event.target.value); setSelectedId(null); }} />
      <div className="chat-search-controls flex shrink-0 items-center">
        <button type="button" aria-label="Oldingi natija" title="Oldingi natija (Shift+Enter)" disabled={!matches.length}
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted disabled:opacity-40" onClick={() => navigate(-1)}>
          <ChevronUp className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" aria-label="Keyingi natija" title="Keyingi natija (Enter)" disabled={!matches.length}
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted disabled:opacity-40" onClick={() => navigate(1)}>
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" aria-label="Qidirishni yopish" title="Qidirishni yopish (Escape)"
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted" onClick={onClose}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
    {error ? <p className="chat-search-status text-xs text-destructive" role="alert">{error}</p>
      : <p className="chat-search-count text-xs text-muted-foreground" role="status" aria-live="polite" aria-atomic="true">{status}</p>}
  </div>;
}
