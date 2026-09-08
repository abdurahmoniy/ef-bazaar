'use client';

import { useEffect, useRef } from 'react';

import type { EmojiItem, EmojiPackDetail } from '@/lib/emoji-packs';

interface EmojiPickerProps {
  packs: EmojiPackDetail[];
  onPick: (item: EmojiItem) => void;
  onClose: () => void;
}

/**
 * Telegram'dagi kabi emoji paneli: to'plamlar sarlavha bilan ajratilgan,
 * ichida statik to'r.
 *
 * <p>Kataklar VIDEO emas. Bir to'plamda 200 tagacha emoji bo'ladi va bir
 * nechta to'plam ochiq turganda ularni o'ynatish brauzerni bo'g'adi.
 * Harakatli ko'rinish preview'da beriladi — xabar qanday chiqishini admin
 * o'sha yerda haqiqiy holicha ko'radi.
 */
export function EmojiPicker({ packs, onPick, onClose }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Tashqariga bosilganda yopiladi. `mousedown`, `click` emas: bosish
    // tugagach fokus muharrirdan ketib, kursor joyi yo'qolardi.
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Emoji tanlash"
      className="absolute z-20 mt-1 max-h-72 w-80 overflow-y-auto rounded-lg border border-border bg-popover p-2 shadow-lg"
    >
      {packs.length === 0 ? (
        <p className="px-2 py-6 text-center text-sm text-muted-foreground">
          To&apos;plam qo&apos;shilmagan. Bot sozlamalari → Emoji.
        </p>
      ) : (
        packs.map((pack) => (
          <section key={pack.id} className="mb-2 last:mb-0">
            <h4 className="px-1 py-1 text-xs font-semibold text-muted-foreground">
              {pack.title}
            </h4>
            <div className="grid grid-cols-8 gap-0.5">
              {pack.items.map((item) => (
                <button
                  key={item.customEmojiId}
                  type="button"
                  title={item.emoji}
                  // onMouseDown, onClick emas: click paytida contenteditable
                  // fokusni allaqachon yo'qotgan bo'lardi va emoji matn
                  // boshiga tushardi.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onPick(item);
                  }}
                  className="flex aspect-square items-center justify-center rounded p-0.5 transition hover:bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.thumbnailUrl}
                    alt={item.emoji}
                    loading="lazy"
                    className="h-full w-full object-contain"
                  />
                </button>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
