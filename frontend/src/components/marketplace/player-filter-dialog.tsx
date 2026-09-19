'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, Flame, Loader2, Search, Sparkles, Users, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';

import { DreamTeamPitch } from '@/components/marketplace/dream-team-pitch';
import { useTelegramBackLayer } from '@/components/telegram/telegram-back-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMediaQuery } from '@/hooks/use-media-query';
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
import { isFeatureEnabled } from '@/lib/feature-flags';
import { getTelegramWebApp } from '@/lib/telegram';
import { telegramHaptic } from '@/lib/telegram-shell';
import { cn } from '@/lib/utils';

type Tab = PlayerFilterTab;

interface PlayerFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The user's saved squads — empty when signed out. */
  teams: DreamTeam[];
  authenticated: boolean;
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
 * Matching uses canonical player identity: exact edition gets full credit,
 * another edition gets 75%, and a priority player counts 3×.
 */
export function PlayerFilterDialog({
  open,
  onOpenChange,
  teams,
  authenticated,
  selected = [],
  activeMinMatch = 4,
  onApply,
  activeCount,
}: PlayerFilterDialogProps) {
  const [tab, setTab] = useState<Tab>('meta');
  const [picked, setPicked] = useState<PlayerMatchSelection[]>(selected);
  const [minMatch, setMinMatch] = useState(activeMinMatch);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const playerLayerId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const applyStartedRef = useRef(false);
  const pickedRef = useRef(picked);
  const openedRef = useRef(false);
  pickedRef.current = picked;

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  useTelegramBackLayer({
    id: playerLayerId,
    kind: 'overlay',
    onBack: close,
    lockVerticalSwipes: true,
  }, open);

  // Reopening should reflect what is actually filtering right now, not the
  // leftovers of an abandoned edit.
  useEffect(() => {
    if (open) {
      if (!openedRef.current) {
        openedRef.current = true;
        setPicked(selected);
        setMinMatch(activeMinMatch);
        applyStartedRef.current = false;
      } else if (
        pickedRef.current.length === selected.length
        && pickedRef.current.every((card, index) => (
          card.efhubId === selected[index]?.efhubId
          && card.playerId === selected[index]?.playerId
        ))
      ) {
        // The launcher hydrates display metadata after mount. Merge that late
        // snapshot only while selection identity is still untouched, retaining
        // mutable choices the user may already have made in this open session.
        setPicked((current) => selected.map((card, index) => ({
          ...card,
          priority: current[index]?.priority,
        })));
      }
    } else {
      const shouldRestoreFocus = openedRef.current;
      openedRef.current = false;
      if (shouldRestoreFocus) triggerRef.current?.focus();
    }
  }, [open, selected, activeMinMatch]);

  const activeTeam = tab === 'team' ? teams[0] ?? null : null;

  function toggle(card: PlayerMatchSelection) {
    const current = pickedRef.current;
    const existing = current.find((candidate) => candidate.playerId === card.playerId);
    if (!existing && current.length >= MAX_MATCH_PLAYERS) return;
    const next = existing?.efhubId === card.efhubId
      ? current.filter((candidate) => candidate.playerId !== card.playerId)
      : existing
        ? current.map((candidate) => candidate.playerId === card.playerId
          ? { ...card, priority: candidate.priority }
          : candidate)
        : [...current, card];
    pickedRef.current = next;
    setPicked(next);
    telegramHaptic(getTelegramWebApp(), 'selection', reducedMotion);
  }

  function apply() {
    if (applyStartedRef.current) return;
    applyStartedRef.current = true;
    const value = playerMatchSelectionForTab(tab, activeTeam, picked);
    onApply(value.length ? value : undefined, minMatch);
    telegramHaptic(getTelegramWebApp(), 'success', reducedMotion);
    close();
  }

  function clearAll() {
    setPicked([]);
    onApply(undefined, minMatch);
    close();
  }

  const chosenCount = tab === 'team'
    ? activeTeam?.slots.filter((slot) => slot.card).length ?? 0
    : picked.length;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <button
          ref={triggerRef}
          id="marketplace-player-filter"
          type="button"
          className={cn(
            'tap-press relative inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-colors',
            activeCount > 0
              ? 'border-amber-400 bg-amber-400 text-amber-950 shadow-sm hover:bg-amber-300 hover:border-amber-300'
              : 'border-amber-400/40 bg-amber-400/10 text-amber-600 hover:border-amber-400/70 hover:bg-amber-400/20 hover:text-amber-700 dark:text-amber-300 dark:hover:text-amber-200',
          )}
        >
          <Flame className="h-3.5 w-3.5" />
          <span>O‘yinchilar</span>
          {activeCount > 0 && (
            <span className="grid h-4 min-w-4 place-items-center rounded-full bg-amber-950 px-1 text-[10px] font-black text-amber-200">
              {activeCount}
            </span>
          )}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out motion-reduce:animate-none" />
        <Dialog.Content
          onFocusOutside={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            if (!triggerRef.current) return;
            event.preventDefault();
            triggerRef.current.focus();
          }}
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex h-[min(92dvh,var(--tg-viewport-height,92dvh))] flex-col rounded-t-2xl bg-card shadow-2xl outline-none data-[state=open]:animate-sheet-up data-[state=closed]:animate-sheet-down motion-reduce:animate-none',
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
                  pickedPlayerIds={picked.flatMap((c) => c.playerId ? [c.playerId] : [])}
                  selectionFull={picked.length >= MAX_MATCH_PLAYERS}
                  onToggle={toggle}
                />
              </Tabs.Content>
              <Tabs.Content value="search" className="outline-none">
                <SearchTab
                  pickedIds={picked.map((c) => c.efhubId)}
                  pickedPlayerIds={picked.flatMap((c) => c.playerId ? [c.playerId] : [])}
                  selectionFull={picked.length >= MAX_MATCH_PLAYERS}
                  onToggle={toggle}
                />
              </Tabs.Content>
              {isFeatureEnabled('dreamTeam') && (
                <Tabs.Content value="team" className="outline-none">
                  <TeamTab team={teams[0] ?? null} authenticated={authenticated} />
                </Tabs.Content>
              )}
            </div>

            <DialogFooter
              chosenCount={chosenCount}
              minMatch={minMatch}
              setMinMatch={setMinMatch}
              onApply={apply}
              onClear={clearAll}
              reducedMotion={reducedMotion}
            />
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DialogHeader() {
  const dreamTeamEnabled = isFeatureEnabled('dreamTeam');
  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'meta', label: 'META', icon: <Flame className="h-4 w-4" /> },
    { id: 'search', label: 'Qidiruv', icon: <Search className="h-4 w-4" /> },
    ...(dreamTeamEnabled ? [{ id: 'team' as const, label: 'Mening jamoam', icon: <Users className="h-4 w-4" /> }] : []),
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
  pickedPlayerIds,
  selectionFull,
  onToggle,
}: {
  pickedIds: number[];
  pickedPlayerIds: string[];
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
          title="META kartalar hozircha yo‘q"
          hint="Keyinroq yana tekshirib ko‘ring."
        />
      ) : (
        <>
          <CardGrid
            cards={cards}
            pickedIds={pickedIds}
            pickedPlayerIds={pickedPlayerIds}
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
  pickedPlayerIds,
  selectionFull,
  onToggle,
}: {
  pickedIds: number[];
  pickedPlayerIds: string[];
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
            pickedPlayerIds={pickedPlayerIds}
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
  authenticated,
}: {
  team: DreamTeam | null;
  authenticated: boolean;
}) {
  if (!team) {
    return (
      <EmptyState
        icon={<Users className="h-8 w-8" />}
        title="Saqlangan jamoa yo'q"
        hint="Dream Team sahifasida 11 ta o'yinchidan jamoa tuzing."
        action={
          <Button asChild size="sm" className="mt-3">
            <a href={authenticated ? '/dream-team' : '/auth/login?from=/dream-team'}>
              Jamoa tuzish
            </a>
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
  pickedPlayerIds,
  selectionFull,
  onToggle,
}: {
  cards: CardSearchResult[];
  pickedIds: number[];
  pickedPlayerIds: string[];
  selectionFull: boolean;
  onToggle: (card: PlayerMatchSelection) => void;
}) {
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
      {cards.map((card) => {
        const isPicked = pickedIds.includes(card.efhubId);
        const isPickedPlayer = pickedPlayerIds.includes(card.playerId);
        const disabled = selectionFull && !isPicked && !isPickedPlayer;
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

interface StrictnessOption {
  value: number;
  label: string;
  description: string;
}

const STRICTNESS_OPTIONS: StrictnessOption[] = [
  {
    value: 2,
    label: 'Moslashuvchan',
    description: 'Kamida 1+ o‘yinchi mos kelsa bo‘ladi (ko‘proq natijalar).',
  },
  {
    value: 4,
    label: 'Muvozanatli',
    description: 'Tavsiya etiladi. Tanlangan o‘yinchilarning aksariyati bo‘lishi kerak.',
  },
  {
    value: 8,
    label: 'Qat’iy',
    description: 'Deyarli barcha tanlangan o‘yinchilar akkountda bo‘lishi shart.',
  },
];

function getActiveStrictnessOption(minMatch: number): StrictnessOption {
  if (minMatch <= 3) return STRICTNESS_OPTIONS[0];
  if (minMatch >= 7) return STRICTNESS_OPTIONS[2];
  return STRICTNESS_OPTIONS[1];
}

function DialogFooter({
  chosenCount,
  minMatch,
  setMinMatch,
  onApply,
  onClear,
  reducedMotion,
}: {
  chosenCount: number;
  minMatch: number;
  setMinMatch: (value: number) => void;
  onApply: () => void;
  onClear: () => void;
  reducedMotion: boolean;
}) {
  const activeOption = getActiveStrictnessOption(minMatch);

  return (
    <div className="shrink-0 space-y-3 border-t border-border bg-card px-4 pb-[calc(0.75rem+var(--app-content-safe-bottom))] pt-3">
      {chosenCount >= MAX_MATCH_PLAYERS && (
        <p className="text-xs font-bold text-amber-700 dark:text-amber-300" role="status">
          Ko&apos;pi bilan 11 ta o&apos;yinchi tanlash mumkin. Boshqasini tanlash uchun bittasini olib tashlang.
        </p>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-bold">
          <span>Qidiruv qat’iyligi</span>
          <span className="text-primary">{activeOption.label}</span>
        </div>
        <div
          role="radiogroup"
          aria-label="Qidiruv qat’iyligi"
          className="grid grid-cols-3 gap-1 rounded-lg bg-muted/70 p-1"
        >
          {STRICTNESS_OPTIONS.map((opt) => {
            const isActive = activeOption.value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => {
                  setMinMatch(opt.value);
                  telegramHaptic(getTelegramWebApp(), 'selection', reducedMotion);
                }}
                className={cn(
                  'tap-press flex min-h-8 items-center justify-center rounded-md px-2 py-1 text-xs font-bold transition',
                  isActive
                    ? 'border border-border/80 bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] font-medium text-muted-foreground leading-snug">
          {activeOption.description}
        </p>
      </div>

      <div className="flex gap-2">
        <Button onClick={onApply} disabled={chosenCount === 0} className="flex-1 font-bold">
          {chosenCount === 0 ? 'O‘yinchi tanlang' : `${chosenCount} o‘yinchi bo‘yicha qidirish`}
        </Button>
        <Button variant="outline" onClick={onClear} className="font-semibold">
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
        <div key={index} className="aspect-[12/17] animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
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
