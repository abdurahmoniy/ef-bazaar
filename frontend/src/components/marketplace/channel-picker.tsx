'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Megaphone, Search, Users } from 'lucide-react';
import { GrowthLink } from '@/components/growth/growth-link';

import {
  channelInitial,
  channelPhotoUrl,
  formatSubscribers,
  searchChannels,
  toggleChannel,
  totalPrice,
  type ChannelCard,
} from '@/lib/partner-channels';

interface ChannelPickerProps {
  selected: string[];
  onChange: (selected: string[]) => void;
}

/**
 * E'lonni hamkor kanallarida ham chiqarish.
 *
 * <p>Tartib SERVERDAN keladi va bu yerda qayta saralanmaydi: bo'sh
 * qidiruvda obunachi bo'yicha reyting, yozilganda nom boshlanishi
 * bo'yicha. Ikki joyda ikki xil tartib bo'lsa ular vaqt o'tib
 * bir-biridan uzoqlashadi.
 *
 * <p>Jami summa ro'yxat ostida turadi: sotuvchi to'plam uchun bir yo'la
 * hisoblanadi, va raqamni ko'rish payti rozi bo'lishdan OLDIN.
 */
export function ChannelPicker({ selected, onChange }: ChannelPickerProps) {
  const [query, setQuery] = useState('');
  const [channels, setChannels] = useState<ChannelCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Kechikkan javob yangisini bosib ketmasin: tez yozilganda so'rovlar
  // tartibsiz qaytadi va eskisi ekranga tushib qolishi mumkin.
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      setLoading(true);
      searchChannels(query)
        .then((found) => {
          if (id !== requestId.current) return;
          setChannels(found);
          setError(null);
        })
        .catch((e) => {
          if (id !== requestId.current) return;
          setError(e instanceof Error ? e.message : 'Yuklanmadi');
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const total = totalPrice(channels, selected);

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Megaphone className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Katta kanallarda ham chiqarish</h2>
          <p className="text-xs text-muted-foreground">
            E&apos;loningiz tanlangan Telegram kanallariga ham joylanadi. Ixtiyoriy.
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Kanal nomi bo'yicha qidirish"
          aria-label="Kanal qidirish"
          className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda…
        </p>
      ) : channels.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">
          {query.trim() ? 'Bunday kanal topilmadi.' : 'Hozircha hamkor kanallari yo‘q.'}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {channels.map((channel) => {
            const picked = selected.includes(channel.channelId);
            return (
              <li key={channel.channelId}>
                <button
                  type="button"
                  onClick={() => onChange(toggleChannel(selected, channel.channelId))}
                  aria-pressed={picked}
                  className="flex w-full items-center gap-3 py-2.5 text-left transition hover:bg-muted/50"
                >
                  {/* Rasm yo'q kanal ham bor — o'shanda bosh harf. */}
                  {channelPhotoUrl(channel) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={channelPhotoUrl(channel) ?? ''}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {channelInitial(channel.title)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{channel.title}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {formatSubscribers(channel.subscriberCount)} obunachi
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {channel.priceSom.toLocaleString('uz-UZ')}
                  </span>
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                      picked ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                    }`}
                  >
                    {picked && <Check className="h-3.5 w-3.5" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected.length > 0 && (
        <p className="border-t border-border pt-3 text-sm">
          <span className="text-muted-foreground">{selected.length} ta kanal · jami </span>
          <span className="font-bold">{total.toLocaleString('uz-UZ')} so&apos;m</span>
        </p>
      )}
      <GrowthLink href="/partnership" target="_blank" rel="noopener noreferrer" event="partnership_open" placement="channel_picker"
        className="inline-flex min-h-11 items-center text-xs font-semibold text-muted-foreground underline underline-offset-4 hover:text-primary">
        Telegram kanalingiz bormi? Hamkorlikni ko‘ring ↗
      </GrowthLink>
    </section>
  );
}
