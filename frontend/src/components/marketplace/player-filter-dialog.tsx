'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Flame, Loader2, Search, Sparkles, Star, Users, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';

import { DreamTeamPitch } from '@/components/marketplace/dream-team-pitch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';
import {
  cardRating,
  type CardSearchResult,
  type DreamTeam,
} from '@/lib/marketplace-types';
import {
  playerMatchSelectionForTab,
  type PlayerFilterTab,
  type PlayerMatchSelection,
} from '@/lib/player-filter-selection';
import { strictnessLabel, strictnessMinimumPercent } from '@/lib/player-match-query';
import { cn } from '@/lib/utils';

type Tab = PlayerFilterTab;

interface PlayerFilterDialogProps {
  /** The user's saved squads — empty when signed out. */
  teams: DreamTeam[];
  /** Cards already applied to the current browse, so the dialog opens in sync. */
  selected?: PlayerMatchSelection[];
  activeMinMatch?: number;
  /** Applies the chosen filter to the URL, preserving other filters. */
  onApply: (cards: PlayerMatchSelection[] | undefined, strictness: number) => void;
  activeCount: number;
}

export type { PlayerMatchSelection } from '@/lib/player-filter-selection';

const META_PAGE_SIZE = 24;
const DEBOUNCE_MS = 250;
const MAX_MATCH_PLAYERS = 11;

/**
 * "META o'yinchilar" — the entry point for filtering accounts by who is in them.
 *
 * Three ways in, because buyers arrive with different amounts of intent:
 *   meta   — no idea yet, show what everyone wants right now (zero typing)
 *   search — has a name in mind
 *   team   — has a saved squad and wants accounts that cover it
 *
 * Matching uses canonical player identity and weighted fuzzy credit: exact
 * edition 100%, another edition 75%, and a priority player counts 3×.
 */
export function PlayerFilterDialog({
  teams,
  selected = [],
  activeMinMatch = 4,
  onApply,
  activeCount,
}: PlayerFilterDialogProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('meta');
  const [picked, setPicked] = useState<PlayerMatchSelection[]>(selected);
  const [minMatch, setMinMatch] = useState(activeMinMatch);

  // Reopening should reflect what is actually filtering right now, not the
  // leftovers of an abandoned edit.
  useEffect(() => {
    if (open) {
      setPicked(selected);
      setMinMatch(activeMinMatch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const activeTeam = tab === 'team' ? teams[0] ?? null : null;

  function toggle(card: PlayerMatchSelection) {
    setPicked((prev) => {
      if (prev.some((c) => c.playerId === card.playerId)) {
        return prev.filter((c) => c.playerId !== card.playerId);
      }
      return prev.length >= MAX_MATCH_PLAYERS ? prev : [...prev, card];
    });
  }

  function togglePriority(playerId: string | undefined) {
    if (!playerId) return;
    setPicked((prev) => prev.map((card) => card.playerId === playerId
      ? { ...card, priority: !card.priority }
      : card));
  }

  function apply() {
    const value = playerMatchSelectionForTab(tab, activeTeam, picked);
    onApply(value.length ? value : undefined, minMatch);
    setOpen(false);
  }

  function clearAll() {
    setPicked([]);
    onApply(undefined, minMatch);
    setOpen(false);
  }

  const chosenCount = tab === 'team'
    ? activeTeam?.slots.filter((slot) => slot.card).length ?? 0
    : picked.length;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={cn(
            'tap-press relative flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold sm:px-3',
            'border border-amber-400/60 bg-gradient-to-br from-amber-400/20 via-amber-300/10 to-transparent',
            'text-amber-600 dark:text-amber-300',
            'shadow-[0_0_16px_-3px_rgba(251,191,36,0.65)] transition',
            'hover:border-amber-400 hover:shadow-[0_0_22px_-2px_rgba(251,191,36,0.85)]',
          )}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 animate-pulse rounded-lg ring-1 ring-amber-400/40 motion-reduce:animate-none"
          />
          <Flame className="h-4 w-4" />
          <span className="hidden sm:inline">META</span>
          {activeCount > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-[11px] font-black text-amber-950">
              {activeCount}
            </span>
          )}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-black/60 backdrop-blur-sm motion-reduce:animate-none" />
        <Dialog.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] animate-sheet-up flex-col rounded-t-2xl bg-card shadow-2xl outline-none motion-reduce:animate-none',
            'sm:inset-0 sm:m-auto sm:h-[86vh] sm:max-w-4xl sm:rounded-2xl',
          )}
        >
          <Dialog.Description className="sr-only">
            META kartalarni tanlang, o‘yinchi qidiring yoki saqlangan Dream Team tarkibini qo‘llang.
          </Dialog.Description>
          <Tabs.Root
            value={tab}
            onValueChange={(value) => setTab(value as Tab)}
            className="contents"
          >
            <DialogHeader />

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              <Tabs.Content value="meta" className="outline-none">
                <MetaTab
                  pickedIds={picked.map((c) => c.efhubId)}
                  selectionFull={picked.length >= MAX_MATCH_PLAYERS}
                  onToggle={toggle}
                />
              </Tabs.Content>
              <Tabs.Content value="search" className="outline-none">
                <SearchTab
                  pickedIds={picked.map((c) => c.efhubId)}
                  selectionFull={picked.length >= MAX_MATCH_PLAYERS}
                  onToggle={toggle}
                />
              </Tabs.Content>
              <Tabs.Content value="team" className="outline-none">
                <TeamTab team={teams[0] ?? null} />
              </Tabs.Content>
            </div>

            <DialogFooter
              chosenCount={chosenCount}
              selected={tab === 'team' ? [] : picked}
              minMatch={minMatch}
              setMinMatch={setMinMatch}
              onTogglePriority={togglePriority}
              onApply={apply}
              onClear={clearAll}
            />
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DialogHeader() {
  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'meta', label: 'META', icon: <Flame className="h-4 w-4" /> },
    { id: 'search', label: 'Qidiruv', icon: <Search className="h-4 w-4" /> },
    { id: 'team', label: 'Mening jamoam', icon: <Users className="h-4 w-4" /> },
  ];
  return (
    <div className="shrink-0 border-b border-border">
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <Dialog.Title className="flex items-center gap-2 text-sm font-black">
          <Sparkles className="h-4 w-4 text-amber-500" />
          O&apos;yinchi bo&apos;yicha filtr
        </Dialog.Title>
        <Dialog.Close asChild>
          <button
            type="button"
            aria-label="Yopish"
            className="grid min-h-11 min-w-11 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </Dialog.Close>
      </div>
      <Tabs.List className="flex gap-1 overflow-x-auto px-3 no-scrollbar" aria-label="O‘yinchi filtri bo‘limlari">
        {tabs.map((item) => (
          <Tabs.Trigger
            key={item.id}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm font-bold text-muted-foreground transition',
              'data-[state=active]:border-primary data-[state=active]:text-primary hover:text-foreground',
            )}
            value={item.id}
          >
            {item.icon}
            {item.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </div>
  );
}

function MetaTab({
  pickedIds,
  selectionFull,
  onToggle,
}: {
  pickedIds: number[];
  selectionFull: boolean;
  onToggle: (card: PlayerMatchSelection) => void;
}) {
  const { cards, loading, error, hasMore, total, loadMore, retry } = useCards({
    tier: 'META',
    size: META_PAGE_SIZE,
  });

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground">
        Hozir eng ko&apos;p qidirilayotgan kartalar. Tanlang — shu o&apos;yinchilar bor
        akkountlar yuqorida chiqadi.
      </p>
      {loading && cards.length === 0 ? (
        <CardGridSkeleton />
      ) : error && cards.length === 0 ? (
        <EmptyState
          icon={<Flame className="h-8 w-8" />}
          title="META kartalar yuklanmadi"
          hint="Aloqani tekshirib, qayta urinib ko‘ring."
          action={<Button size="sm" variant="outline" onClick={retry}>Qayta urinish</Button>}
        />
      ) : cards.length === 0 ? (
        <EmptyState
          icon={<Flame className="h-8 w-8" />}
          title="META kartalar hali belgilanmagan"
          hint="Admin panelda /admin/players sahifasidan belgilang."
        />
      ) : (
        <>
          <CardGrid
            cards={cards}
            pickedIds={pickedIds}
            selectionFull={selectionFull}
            onToggle={onToggle}
          />
          <CatalogControls
            loading={loading}
            error={error}
            hasMore={hasMore}
            count={cards.length}
            total={total}
            onLoadMore={loadMore}
            onRetry={retry}
          />
        </>
      )}
    </div>
  );
}

function SearchTab({
  pickedIds,
  selectionFull,
  onToggle,
}: {
  pickedIds: number[];
  selectionFull: boolean;
  onToggle: (card: PlayerMatchSelection) => void;
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query]);

  const { cards, loading, error, hasMore, total, loadMore, retry } = useCards({
    q: debounced,
    size: 30,
    skip: debounced.length < 2,
  });

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="O'yinchi nomi (masalan: Messi)"
          className="pl-9"
        />
      </div>
      {debounced.length < 2 ? (
        <EmptyState
          icon={<Search className="h-8 w-8" />}
          title="Ism yozing"
          hint="Kamida 2 harf."
        />
      ) : loading && cards.length === 0 ? (
        <CardGridSkeleton />
      ) : error && cards.length === 0 ? (
        <EmptyState
          icon={<Search className="h-8 w-8" />}
          title="Qidiruv yuklanmadi"
          hint="Aloqani tekshirib, qayta urinib ko‘ring."
          action={<Button size="sm" variant="outline" onClick={retry}>Qayta urinish</Button>}
        />
      ) : cards.length === 0 ? (
        <EmptyState
          icon={<Search className="h-8 w-8" />}
          title="Karta topilmadi"
          hint="Boshqa yozuvni sinab ko'ring."
        />
      ) : (
        <>
          <CardGrid
            cards={cards}
            pickedIds={pickedIds}
            selectionFull={selectionFull}
            onToggle={onToggle}
          />
          <CatalogControls
            loading={loading}
            error={error}
            hasMore={hasMore}
            count={cards.length}
            total={total}
            onLoadMore={loadMore}
            onRetry={retry}
          />
        </>
      )}
    </div>
  );
}

function TeamTab({
  team,
}: {
  team: DreamTeam | null;
}) {
  if (!team) {
    return (
      <EmptyState
        icon={<Users className="h-8 w-8" />}
        title="Saqlangan jamoa yo'q"
        hint="Dream Team sahifasida 11 ta o'yinchidan jamoa tuzing."
        action={
          <Button asChild size="sm" className="mt-3">
            <a href="/dream-team">Jamoa tuzish</a>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
        <span className="text-xs font-black">Mening jamoam</span>
        <span className="text-xs font-semibold text-muted-foreground">
          {team.slots.filter((slot) => slot.card).length}/11
        </span>
      </div>
      <div className="mx-auto max-w-sm">
        <DreamTeamPitch slots={team.slots} formation={team.formation} readOnly />
      </div>
      <Button asChild size="sm" variant="outline" className="w-full">
        <a href="/dream-team">Jamoani tahrirlash</a>
      </Button>
    </div>
  );
}

function CardGrid({
  cards,
  pickedIds,
  selectionFull,
  onToggle,
}: {
  cards: CardSearchResult[];
  pickedIds: number[];
  selectionFull: boolean;
  onToggle: (card: PlayerMatchSelection) => void;
}) {
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
      {cards.map((card) => {
        const isPicked = pickedIds.includes(card.efhubId);
        const disabled = selectionFull && !isPicked;
        const rating = cardRating(card);
        return (
          <li key={card.efhubId}>
            <button
              type="button"
              aria-pressed={isPicked}
              disabled={disabled}
              title={disabled ? "Ko'pi bilan 11 ta o'yinchi tanlash mumkin" : card.name}
              onClick={() =>
                onToggle({
                  efhubId: card.efhubId,
                  playerId: card.playerId,
                  name: card.name,
                  overallRating: card.overallRating,
                  maxOverallRating: card.maxOverallRating,
                  cardType: card.cardType,
                  position: card.position,
                  playingStyle: card.playingStyle,
                  imageUrl: card.imageUrl,
                })
              }
              className={cn(
                'min-h-11 w-full rounded-xl border bg-card p-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-45',
                isPicked
                  ? 'border-primary ring-2 ring-primary/30'
                  : 'border-border hover:border-primary/40',
              )}
            >
              <span className="relative block aspect-[12/17] overflow-hidden rounded-lg bg-muted">
                {card.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={card.imageUrl}
                    alt={card.name}
                    loading="lazy"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="grid h-full w-full place-items-center px-1 text-center text-[9px] font-bold text-muted-foreground">
                    {card.name}
                  </span>
                )}
                {card.metaTier === 'META' && (
                  <span className="absolute left-1 top-1 rounded bg-amber-400 px-1 text-[9px] font-black text-amber-950">
                    META
                  </span>
                )}
                {typeof rating === 'number' && (
                  <span className="absolute right-1 top-1 rounded bg-primary px-1 text-[9px] font-black text-primary-foreground">
                    {rating}
                  </span>
                )}
                {isPicked && (
                  <span className="absolute inset-0 grid place-items-center bg-primary/25">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-4 w-4" />
                    </span>
                  </span>
                )}
              </span>
              <span className="mt-1 block truncate text-[11px] font-bold" title={card.name}>
                {card.name}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function DialogFooter({
  chosenCount,
  selected,
  minMatch,
  setMinMatch,
  onTogglePriority,
  onApply,
  onClear,
}: {
  chosenCount: number;
  selected: PlayerMatchSelection[];
  minMatch: number;
  setMinMatch: (value: number) => void;
  onTogglePriority: (playerId: string | undefined) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  return (
    <div className="shrink-0 space-y-3 border-t border-border bg-card px-4 py-3">
      {selected.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar" aria-label="Tanlangan o‘yinchilar ustuvorligi">
          {selected.map((card) => (
            <button
              key={card.efhubId}
              type="button"
              onClick={() => onTogglePriority(card.playerId)}
              aria-pressed={card.priority === true}
              aria-label={`${card.name}: ustuvor, 3 karra hisoblanadi`}
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg border px-2 text-xs font-bold',
                card.priority
                  ? 'border-amber-400 bg-amber-400/15 text-amber-700 dark:text-amber-300'
                  : 'border-border text-muted-foreground',
              )}
            >
              <Star className={cn('h-3.5 w-3.5', card.priority && 'fill-current')} />
              {card.name}
              <span className="text-[10px]">{card.priority ? '3×' : '1×'}</span>
            </button>
          ))}
        </div>
      )}
      {chosenCount >= MAX_MATCH_PLAYERS && (
        <p className="text-xs font-bold text-amber-700 dark:text-amber-300" role="status">
          Ko&apos;pi bilan 11 ta o&apos;yinchi tanlash mumkin. Boshqasini tanlash uchun bittasini olib tashlang.
        </p>
      )}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-bold">
          <span>Qidiruv qat’iyligi</span>
          <span className="text-primary">{strictnessLabel(minMatch)}</span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={minMatch}
          onChange={(event) => setMinMatch(Number(event.target.value))}
          className="w-full accent-primary"
          aria-label="Qidiruv qat’iyligi 1 dan 10 gacha"
        />
        <p className="text-[11px] font-semibold text-muted-foreground">
          Kamida {strictnessMinimumPercent(minMatch)}% weighted moslik. Ustuvor
          o&apos;yinchilar 3× hisoblanadi; ular majburiy emas. Boshqa karta nashri 75% kredit oladi.
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={onApply} disabled={chosenCount === 0} className="flex-1">
          {chosenCount === 0 ? "O'yinchi tanlang" : `Qo'llash (${chosenCount})`}
        </Button>
        <Button variant="outline" onClick={onClear}>
          Tozalash
        </Button>
      </div>
    </div>
  );
}

function CardGridSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
      {Array.from({ length: 12 }).map((_, index) => (
        <div key={index} className="aspect-[12/17] animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}

function CatalogControls({
  loading,
  error,
  hasMore,
  count,
  total,
  onLoadMore,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  count: number;
  total: number;
  onLoadMore: () => void;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <div className="mt-3 flex items-center justify-center gap-2 text-xs text-destructive">
        <span>Keyingi kartalar yuklanmadi.</span>
        <Button size="sm" variant="outline" onClick={onRetry}>Qayta urinish</Button>
      </div>
    );
  }
  if (!hasMore) return null;
  return (
    <div className="mt-3 text-center">
      <Button variant="outline" onClick={onLoadMore} disabled={loading} className="min-h-11">
        {loading ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : null}
        Yana yuklash ({count} / {total})
      </Button>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-border py-12 text-center text-muted-foreground">
      {icon}
      <p className="text-sm font-bold text-foreground">{title}</p>
      <p className="text-xs font-semibold">{hint}</p>
      {action}
    </div>
  );
}

/** Card catalogue fetch shared by the META and search tabs. */
function useCards({
  q,
  tier,
  size,
  skip = false,
}: {
  q?: string;
  tier?: 'META' | 'NORMAL';
  size: number;
  skip?: boolean;
}) {
  const [cards, setCards] = useState<CardSearchResult[]>([]);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [retryVersion, setRetryVersion] = useState(0);

  const key = useMemo(() => `${q ?? ''}|${tier ?? ''}|${size}`, [q, tier, size]);

  useEffect(() => {
    setPage(0);
    setCards([]);
    setTotal(0);
    setError(null);
  }, [key, skip]);

  const load = useCallback(async (signal: AbortSignal) => {
    const params = new URLSearchParams({ size: String(size), page: String(page) });
    if (q) params.set('q', q);
    if (tier) params.set('tier', tier);
    const response = await fetch(buildMarketplaceApiPath('v1/cards', params), {
      headers: { Accept: 'application/json' },
      credentials: 'include',
      signal,
    });
    if (!response.ok) throw new Error(`cards_${response.status}`);
    const payload = (await response.json()) as { items?: CardSearchResult[]; total?: number };
    return {
      items: Array.isArray(payload.items) ? payload.items : [],
      total: typeof payload.total === 'number' ? payload.total : 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, page]);

  useEffect(() => {
    if (skip) {
      setCards([]);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(null);
    load(controller.signal)
      .then((payload) => {
        if (cancelled) return;
        setTotal(payload.total);
        setCards((current) => {
          const combined = page === 0 ? payload.items : [...current, ...payload.items];
          return Array.from(new Map(combined.map((card) => [card.efhubId, card])).values());
        });
      })
      .catch((error) => {
        if (!cancelled && (error as Error).name !== 'AbortError') {
          setError('Kartalar yuklanmadi');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [load, skip, page, retryVersion]);

  return {
    cards,
    loading,
    error,
    total,
    hasMore: cards.length < total,
    loadMore: () => {
      if (!loading && cards.length < total) setPage((current) => current + 1);
    },
    retry: () => setRetryVersion((current) => current + 1),
  };
}
