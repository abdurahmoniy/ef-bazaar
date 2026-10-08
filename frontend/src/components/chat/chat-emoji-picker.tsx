'use client';

import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ChevronDown, Clock, Delete, Search, Smile, X } from 'lucide-react';
import type { EmojiItem, EmojiPackDetail } from '@/lib/emoji-packs';
import { addRecentEmoji, getRecentEmojis } from '@/lib/emoji-recents';
import { searchCustomEmojis } from '@/lib/emoji-search';
import { useTelegramBackLayer } from '@/components/telegram/telegram-back-provider';
import { cn } from '@/lib/utils';

export function ChatEmojiPicker({ packs, loading, error, onPick, onClose, onBackspace, disabled, height }: {
  packs: EmojiPackDetail[]; loading: boolean; error: string | null;
  onPick: (emoji: EmojiItem) => void; onClose: () => void; onBackspace: () => void;
  disabled: boolean; height: number;
}) {
  const [tab, setTab] = useState('all');
  const [recents, setRecents] = useState(getRecentEmojis);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const repeat = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickReset = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerClick = useRef(false);
  const backspace = useRef(onBackspace); backspace.current = onBackspace;
  const stopRepeat = () => { if (repeat.current !== null) clearTimeout(repeat.current); repeat.current = null; };
  const closeSearch = () => { searchRef.current?.blur(); setSearchOpen(false); setQuery(''); };
  const close = () => { searchRef.current?.blur(); onClose(); };
  useTelegramBackLayer({ id: 'chat-emoji-picker', kind: 'overlay', onBack: searchOpen ? closeSearch : close, lockVerticalSwipes: true });

  useEffect(() => () => { stopRepeat(); if (clickReset.current !== null) clearTimeout(clickReset.current); }, []);
  useEffect(() => {
    if (disabled) stopRepeat();
  }, [disabled]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); if (searchOpen) closeSearch(); else close();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  });

  const searching = searchOpen && Boolean(query.trim());
  const selected = packs.find(pack => pack.id === tab);
  const sections = searching
    ? [{ id: 'search', title: 'Qidiruv natijalari', items: searchCustomEmojis(packs, query) }]
    : tab === 'recent'
      ? [{ id: 'recent', title: 'Yaqinda ishlatilganlar', items: recents }]
      : (selected ? [selected] : packs);
  const chooseTab = (id: string) => { closeSearch(); setTab(id); gridRef.current?.scrollTo?.({ top: 0 }); };
  const iconButton = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-manipulation';

  return <div role="group" aria-label="Emoji tanlash paneli" className="chat-emoji-panel -mx-3 mt-2 flex min-h-0 flex-col overflow-hidden border-t border-border bg-card md:mx-0 md:rounded-2xl md:border md:shadow-lg"
    data-searching={searchOpen}
    style={{ '--chat-emoji-height': `${height}px` } as React.CSSProperties}>
    <div className="flex shrink-0 items-center gap-1 border-b border-border px-1 py-1">
      <div role="tablist" aria-label="Emoji to‘plamlari" className="flex min-w-0 flex-1 gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none]">
        {[{ id: 'recent', label: 'Yaqinda ishlatilganlar', icon: <Clock className="h-5 w-5" /> },
          { id: 'all', label: 'Barcha emoji', icon: <Smile className="h-5 w-5" /> },
          ...packs.map(pack => ({ id: pack.id, label: pack.title, icon: pack.items[0]
            // Emoji thumbnails are already proxied at the required size.
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={pack.items[0].thumbnailUrl} alt="" className="h-7 w-7 object-contain" /> : <Smile className="h-5 w-5" /> }))].map(item =>
          <button key={item.id} type="button" role="tab" aria-label={item.label} aria-selected={tab === item.id}
            className={cn(iconButton, tab === item.id && 'bg-primary/10 text-primary')}
            onPointerDown={event => event.preventDefault()} onClick={() => chooseTab(item.id)}>{item.icon}</button>)}
      </div>
      <button type="button" aria-label="Emoji qidirish" aria-expanded={searchOpen} className={cn(iconButton, searchOpen && 'bg-primary/10 text-primary')}
        onPointerDown={event => event.preventDefault()} onClick={() => {
          if (searchOpen) closeSearch();
          else { flushSync(() => setSearchOpen(true)); searchRef.current?.focus(); }
        }}><Search className="h-5 w-5" /></button>
      <button type="button" aria-label="Emoji panelini yopish" className={iconButton} onPointerDown={event => event.preventDefault()} onClick={close}><ChevronDown className="h-5 w-5" /></button>
    </div>
    {searchOpen && <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1">
      <Search aria-hidden className="mx-1 h-5 w-5 shrink-0 text-muted-foreground" />
      <input ref={searchRef} type="search" aria-label="Emoji qidirish matni" value={query} onChange={event => setQuery(event.target.value)}
        placeholder="Emoji yoki to‘plamni qidirish…" enterKeyHint="search" autoComplete="off"
        className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none" />
      <button type="button" aria-label="Qidirishni yopish" className={iconButton} onClick={closeSearch}><X className="h-5 w-5" /></button>
    </div>}
    <div ref={gridRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1">
      {loading ? <p role="status" className="p-3 text-sm text-muted-foreground">Emoji yuklanmoqda…</p>
        : error ? <p role="alert" className="p-3 text-sm text-destructive">{error}</p>
        : !sections.some(section => section.items.length) ? <p role="status" className="p-3 text-sm text-muted-foreground">{searching ? 'Emoji topilmadi' : tab === 'recent' ? 'Tanlagan emojilaringiz shu yerda ko‘rinadi' : 'Hozircha emoji mavjud emas'}</p>
        : sections.map(section => <section key={section.id} aria-label={section.title}>
          <h3 className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">{section.title}</h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-1">
            {section.items.map(item => <button key={item.customEmojiId} type="button" data-emoji-id={item.customEmojiId} aria-label={item.emoji}
              disabled={disabled} className="flex h-11 min-w-11 items-center justify-center rounded-xl hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 touch-manipulation"
              onPointerDown={event => event.preventDefault()} onClick={() => { onPick(item); setRecents(addRecentEmoji(item)); }}>
              {/* Emoji thumbnails are served by the existing media proxy. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.thumbnailUrl} alt="" loading="lazy" draggable={false} className="h-8 w-8 object-contain" />
            </button>)}
          </div>
        </section>)}
    </div>
    <div className={cn('flex shrink-0 items-center justify-between border-t border-border px-2 py-1 pb-[calc(var(--chat-safe-bottom,var(--app-content-safe-bottom,0px))+0.25rem)] md:pb-1', searchOpen && 'hidden')}>
      <span className="px-2 text-xs text-muted-foreground">Emoji</span>
      <button type="button" aria-label="Belgini o‘chirish" disabled={disabled} className={iconButton}
        onPointerDown={event => {
          event.preventDefault(); if (disabled || event.button !== 0) return;
          stopRepeat(); pointerClick.current = true; event.currentTarget.setPointerCapture?.(event.pointerId); backspace.current();
          const again = () => { backspace.current(); repeat.current = setTimeout(again, 80); };
          repeat.current = setTimeout(again, 400);
        }} onPointerUp={() => {
          stopRepeat();
          if (clickReset.current !== null) clearTimeout(clickReset.current);
          clickReset.current = setTimeout(() => { pointerClick.current = false; }, 0);
        }} onPointerCancel={() => { stopRepeat(); pointerClick.current = false; }} onLostPointerCapture={stopRepeat}
        onClick={() => {
          if (pointerClick.current) { pointerClick.current = false; return; }
          if (!disabled) backspace.current();
        }}>
        <Delete className="h-5 w-5" />
      </button>
    </div>
  </div>;
}
