'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Check, RefreshCw, Search, Sparkles, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { adminRefreshMaxOvr, adminSetCardMetaTier } from '@/lib/marketplace-actions';
import { cardRating } from '@/lib/marketplace-types';
import type { CardSearchResult, CardType, MetaTier } from '@/lib/marketplace-types';
import { cn } from '@/lib/utils';

interface AdminPlayersProps {
  cards: CardSearchResult[];
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

  function applyTier(efhubIds: number[], tier: MetaTier) {
    if (efhubIds.length === 0) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await adminSetCardMetaTier(efhubIds, tier);
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
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 backdrop-blur">
          <span className="text-sm font-bold">{selectedIds.length} ta tanlandi</span>
          <Button size="sm" disabled={isPending} onClick={() => applyTier(selectedIds, 'META')}>
            <Sparkles className="mr-1.5 h-4 w-4" />
            META qilish
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => applyTier(selectedIds, 'NORMAL')}
          >
            META&apos;dan olib tashlash
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => setSelected(new Set())}
          >
            Bekor qilish
          </Button>
        </div>
      )}

      {cards.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-muted-foreground">
          <Users className="h-8 w-8" />
          <p className="text-sm font-semibold">Karta topilmadi</p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {cards.map((card) => (
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
  card: CardSearchResult;
  selected: boolean;
  disabled: boolean;
  onToggleSelected: () => void;
  onToggleTier: () => void;
}) {
  const isMeta = card.metaTier === 'META';
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
