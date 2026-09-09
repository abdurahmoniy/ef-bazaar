'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Search, Smile, X } from 'lucide-react';

import type { EmojiItem, EmojiPackDetail } from '@/lib/emoji-packs';
import { addRecentEmoji, getRecentEmojis } from '@/lib/emoji-recents';
import { QUICK_CATEGORIES, searchCustomEmojis } from '@/lib/emoji-search';
import { cn } from '@/lib/utils';

interface EmojiPickerProps {
  packs: EmojiPackDetail[];
  onPick: (item: EmojiItem) => void;
  onClose: () => void;
}

type ActiveTab = 'all' | 'recents' | string; // 'string' is pack.id

/**
 * Telegram usulidagi to'liq emoji tanlash paneli.
 *
 * <p>Imkoniyatlar:
 * <ul>
 *   <li><b>Tepada tablar</b>: 🕒 Oxirgi ishlatilganlar, 😀 Barchasi, to'plam piktogrammalari;</li>
 *   <li><b>Qidiruv</b>: Asl emoji (😂, ⚽, 🔥) va ko'p tilli kalit so'zlar bo'yicha qidirish;</li>
 *   <li><b>Tezkor reaksiyalar</b>: ❤️, 👍, 👎, 🎉, 😄, 😢, 😡, 🔥;</li>
 *   <li><b>Ixcham to'r</b>: Telegram o'lchamidagi 8 ustunli kataklar.</li>
 * </ul>
 */
export function EmojiPicker({ packs, onPick, onClose }: EmojiPickerProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [recents, setRecents] = useState<EmojiItem[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Recents'ni localStorage dan yuklash
  useEffect(() => {
    setRecents(getRecentEmojis());
  }, []);

  function handlePick(item: EmojiItem) {
    const updated = addRecentEmoji(item);
    setRecents(updated);
    onPick(item);
  }

  // Qidiruv yoki kategoriya filtrlangan natijalari
  const searchResults = useMemo(() => {
    if (!searchQuery && !selectedCategory) return null;
    return searchCustomEmojis(packs, searchQuery, selectedCategory);
  }, [packs, searchQuery, selectedCategory]);

  // Faol to'plam (agar tab pack.id bo'lsa)
  const activePack = useMemo(() => {
    if (activeTab === 'all' || activeTab === 'recents') return null;
    return packs.find((p) => p.id === activeTab) || null;
  }, [packs, activeTab]);

  return (
    <div
      role="region"
      aria-label="Telegram emoji paneli"
      className="flex h-[320px] w-full flex-col border-t border-border bg-card/60 backdrop-blur-sm select-none"
    >
      {/* ---------- Tepada Tablar (Telegram uslubi) ---------- */}
      <div className="flex items-center justify-between border-b border-border/70 px-2 py-1.5">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
          {/* Recents tabi */}
          <button
            type="button"
            title="Yaqinda ishlatilganlar"
            onClick={() => {
              setActiveTab('recents');
              setSearchQuery('');
              setSelectedCategory(null);
            }}
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
              activeTab === 'recents'
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Clock className="h-4 w-4" />
          </button>

          {/* Barchasi tabi */}
          <button
            type="button"
            title="Barcha emojilar"
            onClick={() => {
              setActiveTab('all');
              setSearchQuery('');
              setSelectedCategory(null);
            }}
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
              activeTab === 'all'
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Smile className="h-4 w-4" />
          </button>

          <div className="mx-1 h-4 w-px bg-border/80 shrink-0" />

          {/* To'plamlar tablari (pack birinchi emojisi piktogramma qilib olinadi) */}
          {packs.map((pack) => {
            const previewIcon = pack.items[0]?.thumbnailUrl;
            const isSelected = activeTab === pack.id;
            return (
              <button
                key={pack.id}
                type="button"
                title={pack.title}
                onClick={() => {
                  setActiveTab(pack.id);
                  setSearchQuery('');
                  setSelectedCategory(null);
                }}
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md p-1 transition-all',
                  isSelected
                    ? 'bg-primary/20 ring-1 ring-primary/40'
                    : 'opacity-70 hover:opacity-100 hover:bg-muted',
                )}
              >
                {previewIcon ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={previewIcon}
                    alt={pack.title}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="text-xs font-semibold">{pack.title.slice(0, 1)}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Panelni yopish tugmasi */}
        <button
          type="button"
          onClick={onClose}
          title="Panelni yopish"
          className="ml-2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ---------- Qidiruv va Tezkor Reaksiyalar ---------- */}
      <div className="border-b border-border/60 bg-muted/20 px-2 py-1.5 space-y-1.5">
        <div className="relative flex items-center">
          <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Qidirish (masalan: 😂, olov, futbol, pul, smile)..."
            className="w-full rounded-md border border-border/80 bg-background/90 py-1 pl-8 pr-7 text-xs outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Tezkor reaksiyalar / his-tuyg'ular lentasi */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
          {QUICK_CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(isActive ? null : cat.id)}
                className={cn(
                  'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-all shrink-0',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/70 text-foreground/80 hover:bg-muted hover:text-foreground',
                )}
              >
                <span>{cat.emoji}</span>
                <span className="text-[11px] font-medium">{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------- Emojilar To'ri (Scrollable Grid) ---------- */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-2"
      >
        {/* QIDIRUV VA REAKSIYALAR NATIJALARI */}
        {searchResults !== null ? (
          <div>
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-muted-foreground">
                Qidiruv natijalari
              </span>
              <span className="text-[11px] text-muted-foreground">
                {searchResults.length} ta emoji
              </span>
            </div>
            {searchResults.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Mos keluvchi emoji topilmadi.
              </div>
            ) : (
              <div className="grid grid-cols-8 gap-1 sm:grid-cols-10">
                {searchResults.map((item) => (
                  <button
                    key={item.customEmojiId}
                    type="button"
                    title={item.emoji ? `${item.emoji} (${item.customEmojiId})` : item.customEmojiId}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handlePick(item);
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-lg p-0.5 transition-all hover:bg-muted hover:scale-110 active:scale-95"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.thumbnailUrl}
                      alt={item.emoji}
                      loading="lazy"
                      className="h-7 w-7 object-contain"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'recents' ? (
          /* RECENTS TABI */
          <div>
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-muted-foreground">
                Yaqinda ishlatilganlar
              </span>
              <span className="text-[11px] text-muted-foreground">
                {recents.length} ta
              </span>
            </div>
            {recents.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Hali ishlatilgan emojilar yo&apos;q. Biror emojini tanlasangiz shu yerda saqlanadi.
              </div>
            ) : (
              <div className="grid grid-cols-8 gap-1 sm:grid-cols-10">
                {recents.map((item) => (
                  <button
                    key={item.customEmojiId}
                    type="button"
                    title={item.emoji ? `${item.emoji} (${item.customEmojiId})` : item.customEmojiId}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handlePick(item);
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-lg p-0.5 transition-all hover:bg-muted hover:scale-110 active:scale-95"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.thumbnailUrl}
                      alt={item.emoji}
                      loading="lazy"
                      className="h-7 w-7 object-contain"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : activePack ? (
          /* AYRIM TO'PLAM TABI */
          <div>
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-muted-foreground">
                {activePack.title}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {activePack.items.length} ta
              </span>
            </div>
            <div className="grid grid-cols-8 gap-1 sm:grid-cols-10">
              {activePack.items.map((item) => (
                <button
                  key={item.customEmojiId}
                  type="button"
                  title={item.emoji ? `${item.emoji} (${item.customEmojiId})` : item.customEmojiId}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handlePick(item);
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-lg p-0.5 transition-all hover:bg-muted hover:scale-110 active:scale-95"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.thumbnailUrl}
                    alt={item.emoji}
                    loading="lazy"
                    className="h-7 w-7 object-contain"
                  />
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* BARCHASI (ALL) TABI */
          <div className="space-y-3">
            {/* Agar recents mavjud bo'lsa yuqorida ko'rsatamiz */}
            {recents.length > 0 && (
              <section className="border-b border-border/50 pb-2">
                <h4 className="mb-1.5 px-1 text-xs font-semibold text-muted-foreground">
                  Yaqinda ishlatilganlar
                </h4>
                <div className="grid grid-cols-8 gap-1 sm:grid-cols-10">
                  {recents.slice(0, 16).map((item) => (
                    <button
                      key={`recent-${item.customEmojiId}`}
                      type="button"
                      title={item.emoji ? `${item.emoji} (${item.customEmojiId})` : item.customEmojiId}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handlePick(item);
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-lg p-0.5 transition-all hover:bg-muted hover:scale-110 active:scale-95"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.thumbnailUrl}
                        alt={item.emoji}
                        loading="lazy"
                        className="h-7 w-7 object-contain"
                      />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {packs.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                To&apos;plam qo&apos;shilmagan. Bot sozlamalari → Emoji bo&apos;limidan qo&apos;shing.
              </p>
            ) : (
              packs.map((pack) => (
                <section key={pack.id}>
                  <div className="mb-1.5 flex items-center justify-between px-1">
                    <h4 className="text-xs font-semibold text-muted-foreground">
                      {pack.title}
                    </h4>
                    <span className="text-[11px] text-muted-foreground">
                      {pack.items.length} ta
                    </span>
                  </div>
                  <div className="grid grid-cols-8 gap-1 sm:grid-cols-10">
                    {pack.items.map((item) => (
                      <button
                        key={item.customEmojiId}
                        type="button"
                        title={item.emoji ? `${item.emoji} (${item.customEmojiId})` : item.customEmojiId}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handlePick(item);
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-lg p-0.5 transition-all hover:bg-muted hover:scale-110 active:scale-95"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.thumbnailUrl}
                          alt={item.emoji}
                          loading="lazy"
                          className="h-7 w-7 object-contain"
                        />
                      </button>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
