'use client';

import { useEffect, useId, useState } from 'react';
import { Check, ExternalLink, Loader2, Megaphone, RefreshCw, Search, Users, X } from 'lucide-react';
import { GrowthLink } from '@/components/growth/growth-link';
import { Button } from '@/components/ui/button';
import { formatCompactNumber } from '@/lib/marketplace-format';
import { channelInitial, channelPhotoUrl, formatAdvertisingPrice, formatSubscribers, searchChannels, totalPrice, type ChannelCard } from '@/lib/partner-channels';
import { cn } from '@/lib/utils';

interface ChannelPickerProps {
  selected: ChannelCard[];
  onChange: (selected: ChannelCard[]) => void;
  disabled?: boolean;
}

/** Selected channel snapshots live outside filtered results so the basket keeps its full price. */
export function ChannelPicker({ selected, onChange, disabled = false }: ChannelPickerProps) {
  const [query, setQuery] = useState('');
  const [channels, setChannels] = useState<ChannelCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const searchId = useId();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    const timer = setTimeout(() => {
      searchChannels(query)
        .then((found) => { if (active) setChannels(found); })
        .catch(() => { if (active) setError(true); })
        .finally(() => { if (active) setLoading(false); });
    }, query ? 250 : 0);
    return () => { clearTimeout(timer); active = false; };
  }, [query, attempt]);

  const total = totalPrice(selected, selected.map(channel => channel.channelId));
  const remove = (id: string) => onChange(selected.filter(channel => channel.channelId !== id));

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5" aria-label="Reklama kanallarini tanlash">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Megaphone aria-hidden className="h-5 w-5" /></span>
        <div className="min-w-0">
          <h2 className="text-base font-bold">Telegram kanallarini tanlang</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">E’loningizni qayerda ko‘rsatishni tanlang. Har bir narx — bir marta joylash uchun.</p>
        </div>
      </div>

      {selected.length > 0 && (
        <div className="space-y-2 rounded-xl bg-primary/5 p-3" aria-label="Tanlangan kanallar">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">{selected.length} ta kanal tanlandi</p>
            <button type="button" disabled={disabled} onClick={() => onChange([])} className="min-h-11 rounded-lg px-2 text-sm font-medium text-muted-foreground underline underline-offset-4 disabled:opacity-50">Barchasini olib tashlash</button>
          </div>
          <ul className="space-y-1">
            {selected.map(channel => <li key={channel.channelId} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 break-words text-sm">{channel.title}</span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{channel.priceSom === 0 ? 'Bepul' : formatAdvertisingPrice(channel.priceSom)}</span>
              <button type="button" disabled={disabled} onClick={() => remove(channel.channelId)} aria-label={`${channel.title} tanlovdan olib tashlash`} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"><X aria-hidden className="h-4 w-4" /></button>
            </li>)}
          </ul>
          <p aria-label="Reklama jami" role="status" className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm"><span className="text-muted-foreground">Jami</span><strong className="text-lg tabular-nums">{formatAdvertisingPrice(total)}</strong></p>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor={searchId} className="text-sm font-medium">Kanal qidirish</label>
        <div className="relative">
          <Search aria-hidden className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input id={searchId} type="search" value={query} disabled={disabled} onChange={event => setQuery(event.target.value)} placeholder="Kanal nomini yozing" className="min-h-12 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" />
        </div>
      </div>

      {loading ? <p role="status" className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Kanallar yuklanmoqda…</p>
        : error ? <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 p-4"><p className="text-sm">Kanallar yuklanmadi. Aloqani tekshirib, qayta urinib ko‘ring.</p><Button type="button" variant="outline" disabled={disabled} onClick={() => setAttempt(value => value + 1)}><RefreshCw aria-hidden /> Qayta urinish</Button></div>
        : channels.length === 0 ? <div className="space-y-2 py-4 text-sm text-muted-foreground"><p>{query.trim() ? 'Bunday kanal topilmadi. Boshqa nom bilan qidiring.' : 'Hozircha hamkor kanallari yo‘q.'}</p>{query.trim() && <Button type="button" variant="outline" disabled={disabled} onClick={() => setQuery('')}>Barcha kanallarni ko‘rish</Button>}</div>
        : <>
          <p className="text-xs text-muted-foreground">{formatCompactNumber(channels.length)} ta kanal · obunachilar soni ko‘rishlar kafolati emas</p>
          <ul className="space-y-2">
            {channels.map(channel => {
              const picked = selected.some(item => item.channelId === channel.channelId);
              const photo = channelPhotoUrl(channel);
              return <li key={channel.channelId} className={cn('overflow-hidden rounded-xl border', picked ? 'border-primary/60 bg-primary/5' : 'border-border')}>
                <button type="button" disabled={disabled} aria-pressed={picked} onClick={() => picked ? remove(channel.channelId) : onChange([...selected, channel])}
                  className="flex min-h-20 w-full items-center gap-3 p-3 text-left transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" loading="lazy" />
                  ) : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted font-bold text-foreground">{channelInitial(channel.title)}</span>}
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block break-words text-sm font-semibold">{channel.title}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><Users aria-hidden className="h-3.5 w-3.5" /> {formatSubscribers(channel.subscriberCount)} obunachi</span>
                    <span className="block text-sm font-bold tabular-nums text-primary">{channel.priceSom === 0 ? 'Bepul' : formatAdvertisingPrice(channel.priceSom)}</span>
                  </span>
                  <span aria-hidden className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-md border', picked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/50')}>{picked && <Check className="h-4 w-4" />}</span>
                </button>
                {channel.username && <a href={`https://t.me/${encodeURIComponent(channel.username.replace(/^@/, ''))}`} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center gap-1.5 border-t border-border text-xs font-medium text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">Kanalni ko‘rish <ExternalLink aria-hidden className="h-3.5 w-3.5" /></a>}
              </li>;
            })}
          </ul>
        </>}
      <GrowthLink href="/partnership" target="_blank" rel="noopener noreferrer" event="partnership_open" placement="channel_picker" className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-muted-foreground underline underline-offset-4 hover:text-foreground">Telegram kanalingiz bormi? Hamkorlikni ko‘ring <ExternalLink aria-hidden className="h-3 w-3" /></GrowthLink>
    </section>
  );
}
