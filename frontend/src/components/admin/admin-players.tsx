'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { CalendarClock, Check, RefreshCw, Search, Sparkles, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  adminExpireCardMeta,
  adminRefreshMaxOvr,
  adminSetCardMetaTier,
} from '@/lib/marketplace-actions';
import { cardRating } from '@/lib/marketplace-types';
import type { AdminCardSearchResult, CardType, MetaTier } from '@/lib/marketplace-types';
import { cn } from '@/lib/utils';

interface AdminPlayersProps {
  cards: AdminCardSearchResult[];
  total: number;
  query?: string;
  activeType?: CardType;
  activeTier?: MetaTier;
}

const TYPE_FILTERS: Array<{ value?: CardType; label: string }> = [
  { value: undefined, label: 'Hammasi' },
  { value: 'BIGTIME', label: 'Big Time' },
  { value: 'EPIC', label: 'Epic' },
  { value: 'SHOWTIME', label: 'Showtime' },
];

const TIER_FILTERS: Array<{ value?: MetaTier; label: string }> = [
  { value: undefined, label: 'Barcha daraja' },
  { value: 'META', label: 'META' },
  { value: 'NORMAL', label: 'Oddiy' },
];

/**
 * Player card catalogue with meta tier curation.
 *
 * Only the tier is editable — card data itself comes from the nightly efhub
 * scrape and gets overwritten on the next run, so editing it here would be a
 * lie. Filters live in the URL (server component re-fetches), selection lives
 * in local state and resets on navigation, which is what you want: a bulk
 * action should never silently apply to a page you can no longer see.
 */
export function AdminPlayers({ cards, total, query, activeType, activeTier }: AdminPlayersProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(query ?? '');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [priority, setPriority] = useState(50);
  const [activeFrom, setActiveFrom] = useState('');
  const [activeUntil, setActiveUntil] = useState('');
  const [reason, setReason] = useState('');
  const [demandSort, setDemandSort] = useState<'catalogue' | '7d' | '30d'>('catalogue');

  function navigate(next: { q?: string; type?: CardType; tier?: MetaTier }) {
    const params = new URLSearchParams();
    const q = next.q ?? query;
    const type = 'type' in next ? next.type : activeType;
    const tier = 'tier' in next ? next.tier : activeTier;
    if (q) params.set('q', q);
    if (type) params.set('type', type);
    if (tier) params.set('tier', tier);
    // Any filter change resets to page 0 — page 3 of the old result set means
    // nothing in the new one.
    const qs = params.toString();
    setSelected(new Set());
    router.push(qs ? `/admin/players?${qs}` : '/admin/players');
  }

  function toggleSelected(efhubId: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(efhubId)) next.delete(efhubId);
      else next.add(efhubId);
      return next;
    });
  }

  function applyTier(efhubIds: number[], tier: MetaTier, useEditor = false) {
    if (efhubIds.length === 0) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await adminSetCardMetaTier(efhubIds, tier,
        tier === 'META' ? {
          priority: useEditor ? priority : 50,
          activeFrom: useEditor ? localToIso(activeFrom) : undefined,
          activeUntil: useEditor ? localToIso(activeUntil) : undefined,
          reason: useEditor ? reason.trim() || undefined : undefined,
        } : { reason: useEditor ? reason.trim() || undefined : undefined });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSelected(new Set());
      setNotice(
        result.data.updated === 0
          ? "Hech narsa o'zgarmadi — kartalar allaqachon shu darajada edi"
          : `${result.data.updated} ta karta ${tier === 'META' ? 'META' : 'oddiy'} qilindi`,
      );
      router.refresh();
    });
  }

  function expireMeta(efhubIds: number[]) {
    if (efhubIds.length === 0) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await adminExpireCardMeta(efhubIds, reason.trim() || undefined);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSelected(new Set());
      setNotice(`${result.data.updated} ta kartaning META muddati tugatildi`);
      router.refresh();
    });
  }

  function refreshMaxOvr() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await adminRefreshMaxOvr();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setNotice(
        `MAX OVR: ${result.data.changed} ta karta yangilandi (${result.data.matched} tasi tekshirildi)`,
      );
      router.refresh();
    });
  }

  const selectedIds = [...selected];
  const metaCount = cards.filter((card) => card.metaTier === 'META').length;
  const visibleCards = useMemo(() => {
    if (demandSort === 'catalogue') return cards;
    const field = demandSort === '7d' ? 'interest7d' : 'interest30d';
    return [...cards].sort((left, right) =>
      (right[field] ?? 0) - (left[field] ?? 0) || left.name.localeCompare(right.name));
  }, [cards, demandSort]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-muted-foreground">
          Jami: {total} ta karta · shu sahifada {metaCount} ta META
        </p>
        <Button size="sm" variant="outline" disabled={isPending} onClick={refreshMaxOvr}>
          <RefreshCw className="mr-1.5 h-4 w-4" />
          MAX OVR yangilash
        </Button>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          navigate({ q: search.trim() });
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="O'yinchi nomi (kamida 2 harf)"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="outline" disabled={isPending}>
          Qidirish
        </Button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {TYPE_FILTERS.map((filter) => (
          <FilterChip
            key={filter.label}
            label={filter.label}
            active={activeType === filter.value}
            onClick={() => navigate({ type: filter.value })}
          />
        ))}
        <span className="mx-1 w-px bg-border" aria-hidden />
        {TIER_FILTERS.map((filter) => (
          <FilterChip
            key={filter.label}
            label={filter.label}
            active={activeTier === filter.value}
            onClick={() => navigate({ tier: filter.value })}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <span>Shu sahifani talab bo&apos;yicha:</span>
        {(['catalogue', '7d', '30d'] as const).map((value) => (
          <FilterChip
            key={value}
            label={value === 'catalogue' ? 'Katalog tartibi' : value === '7d' ? '7 kun' : '30 kun'}
            active={demandSort === value}
            onClick={() => setDemandSort(value)}
          />
        ))}
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          {notice}
        </p>
      )}

      {selectedIds.length > 0 && (
        <div className="sticky top-2 z-20 space-y-3 rounded-xl border border-primary/30 bg-background/95 p-3 shadow-lg backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold">{selectedIds.length} ta tanlandi</span>
            <label className="flex items-center gap-1 text-xs font-bold">
              Priority
              <Input
                type="number"
                min={0}
                max={100}
                value={priority}
                onChange={(event) => setPriority(Math.max(0, Math.min(100, Number(event.target.value))))}
                className="h-8 w-20"
              />
            </label>
            <Input
              type="datetime-local"
              value={activeFrom}
              onChange={(event) => setActiveFrom(event.target.value)}
              aria-label="META boshlanish vaqti"
              className="h-8 w-auto"
            />
            <Input
              type="datetime-local"
              value={activeUntil}
              onChange={(event) => setActiveUntil(event.target.value)}
              aria-label="META tugash vaqti"
              className="h-8 w-auto"
            />
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={240}
              placeholder="Sabab (masalan: turnir metasi)"
              className="h-8 min-w-[14rem] flex-1"
            />
          </div>
          <p className="text-xs font-semibold text-muted-foreground">
            Vaqtlar bo&apos;sh qolsa META hozir boshlanadi va muddatsiz davom etadi.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={isPending} onClick={() => applyTier(selectedIds, 'META', true)}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              Faollashtirish / rejalash
            </Button>
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => expireMeta(selectedIds)}>
              <CalendarClock className="mr-1.5 h-4 w-4" />
              Hozir tugatish
            </Button>
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => applyTier(selectedIds, 'NORMAL', true)}>
              Lifecycle tozalash
            </Button>
            <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setSelected(new Set())}>
              Bekor qilish
            </Button>
          </div>
        </div>
      )}

      {cards.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-muted-foreground">
          <Users className="h-8 w-8" />
          <p className="text-sm font-semibold">Karta topilmadi</p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visibleCards.map((card) => (
            <PlayerRow
              key={card.efhubId}
              card={card}
              selected={selected.has(card.efhubId)}
              disabled={isPending}
              onToggleSelected={() => toggleSelected(card.efhubId)}
              onToggleTier={() =>
                applyTier([card.efhubId], card.metaTier === 'META' ? 'NORMAL' : 'META')
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'tap-press rounded-lg border px-2.5 py-1.5 text-xs font-bold transition',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-card text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}

function PlayerRow({
  card,
  selected,
  disabled,
  onToggleSelected,
  onToggleTier,
}: {
  card: AdminCardSearchResult;
  selected: boolean;
  disabled: boolean;
  onToggleSelected: () => void;
  onToggleTier: () => void;
}) {
  const isMeta = card.metaTier === 'META';
  const scheduled = card.configuredMetaTier === 'META' && !isMeta
    && card.metaActiveFrom && new Date(card.metaActiveFrom).getTime() > Date.now();
  const expired = card.configuredMetaTier === 'META' && !isMeta && !scheduled;
  return (
    <li
      className={cn(
        'relative overflow-hidden rounded-xl border bg-card p-2 shadow-card transition',
        selected ? 'border-primary ring-2 ring-primary/30' : 'border-border',
        isMeta && !selected && 'border-amber-400/60',
      )}
    >
      <button
        type="button"
        onClick={onToggleSelected}
        className="block w-full text-left"
        aria-pressed={selected}
      >
        <span className="relative mx-auto block aspect-[12/17] w-full max-w-[7rem] overflow-hidden rounded-lg bg-muted">
          {card.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.imageUrl}
              alt={card.name}
              loading="lazy"
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="grid h-full w-full place-items-center px-1 text-center text-[10px] font-bold text-muted-foreground">
              {card.name}
            </span>
          )}
          {isMeta && (
            <span className="absolute left-1 top-1 rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-black text-amber-950">
              META
            </span>
          )}
          {selected && (
            <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
              <Check className="h-3.5 w-3.5" />
            </span>
          )}
        </span>
        <span className="mt-1.5 block truncate text-xs font-bold" title={card.name}>
          {card.name}
        </span>
        <span className="block truncate text-[11px] font-semibold text-muted-foreground">
          {cardRating(card) ?? '—'} · {card.position ?? '—'} · {card.cardType}
        </span>
        <span className="mt-0.5 block text-[10px] font-semibold text-muted-foreground">
          {isMeta
            ? `Faol META · P${card.configuredMetaPriority}`
            : scheduled
              ? `Rejalangan · P${card.configuredMetaPriority}`
              : expired
                ? 'Muddati tugagan'
                : 'Oddiy'}
        </span>
        <span
          className="block text-[10px] font-semibold text-primary"
          title="Filtrni Qo'llash bosilganda deduplikatsiya qilingan qiziqish"
        >
          Talab: {card.interest7d ?? 0} / 7 kun · {card.interest30d ?? 0} / 30 kun
        </span>
        {card.metaReason && (
          <span className="block truncate text-[10px] text-muted-foreground" title={card.metaReason}>
            {card.metaReason}
          </span>
        )}
      </button>
      <Button
        size="sm"
        variant={isMeta ? 'outline' : 'default'}
        disabled={disabled}
        className="mt-1.5 h-7 w-full text-[11px]"
        onClick={onToggleTier}
      >
        {isMeta ? "META'dan olish" : 'META qilish'}
      </Button>
    </li>
  );
}

function localToIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
