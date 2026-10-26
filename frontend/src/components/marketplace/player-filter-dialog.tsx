'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Flame, Loader2, Search, SlidersHorizontal, Users, X } from 'lucide-react';
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

const CARD_PAGE_SIZE = 28;
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
    pickedRef.current = [];
    setPicked([]);
    telegramHaptic(getTelegramWebApp(), 'selection', reducedMotion);
  }

  function removePlayer(efhubId: number) {
    const next = pickedRef.current.filter((card) => card.efhubId !== efhubId);
    pickedRef.current = next;
    setPicked(next);
    telegramHaptic(getTelegramWebApp(), 'selection', reducedMotion);
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
              : 'border-warning-border bg-warning-soft text-warning hover:border-warning hover:bg-warning/20',
          )}
        >
          <Flame className="h-3.5 w-3.5" />
          <span>O‘yinchilar</span>
          {activeCount > 0 && (
            <span className="grid h-4 min-w-4 place-items-center rounded-full bg-warning-soft px-1 text-[10px] font-black text-warning">
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
            'fixed inset-x-0 bottom-0 z-50 flex h-[min(94dvh,var(--tg-viewport-height,94dvh))] flex-col overflow-hidden rounded-t-2xl bg-card shadow-2xl outline-none data-[state=open]:animate-sheet-up data-[state=closed]:animate-sheet-down motion-reduce:animate-none',
            'sm:inset-0 sm:m-auto sm:h-[min(82dvh,720px)] sm:max-w-3xl sm:rounded-2xl',
            '[@media(max-height:700px)]:block [@media(max-height:700px)]:overflow-y-auto',
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

            {tab !== 'team' && picked.length > 0 && (
              <SelectedPlayers picked={picked} onRemove={removePlayer} onClear={clearAll} />
            )}

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/20 px-3 py-3 sm:px-4 [@media(max-height:700px)]:overflow-visible">
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
              canRemoveFilter={activeCount > 0 && tab !== 'team'}
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
    <div className="shrink-0 border-b border-border px-3 pb-2 pt-3 sm:px-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Dialog.Title className="text-lg font-bold tracking-tight">
            O‘yinchilar
          </Dialog.Title>
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground sm:text-xs">
            Kerakli o‘yinchilarni tanlang, mos akkountlarni toping.
          </p>
        </div>
        <Dialog.Close asChild>
          <button
            type="button"
            aria-label="Yopish"
            className="grid min-h-11 min-w-11 place-items-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </Dialog.Close>
      </div>
      <Tabs.List className="mt-2 flex gap-1 rounded-lg bg-muted p-0.5" aria-label="O‘yinchi filtri bo‘limlari">
        {tabs.map((item) => (
          <Tabs.Trigger
            key={item.id}
            className={cn(
              'inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors',
              'data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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

function SelectedPlayers({ picked, onRemove, onClear }: {
  picked: PlayerMatchSelection[];
  onRemove: (efhubId: number) => void;
  onClear: () => void;
}) {
  return (
    <section aria-label="Tanlangan o‘yinchilar" className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1 sm:px-4">
      <p className="shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground" role="status">
        <span className="sr-only">Tanlanganlar </span>{picked.length}/11
      </p>
      <ul className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto overscroll-x-contain py-1">
        {picked.map((card) => (
          <li key={card.efhubId} className="shrink-0">
            <button
              type="button"
              aria-label={`${card.name} — olib tashlash`}
              title={`${card.name} — olib tashlash`}
              onClick={() => onRemove(card.efhubId)}
              className="relative h-12 w-11 rounded-md border border-primary/20 bg-muted p-0.5 transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span className="relative block h-full w-full overflow-hidden rounded-sm">
                <span className="absolute inset-0 grid place-items-center px-0.5 text-center text-[8px] font-semibold leading-tight text-muted-foreground">
                  {card.name}
                </span>
                {card.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={card.imageUrl}
                    alt=""
                    className="relative h-full w-full bg-muted object-contain"
                    onError={(event) => { event.currentTarget.style.display = 'none'; }}
                  />
                )}
              </span>
              <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full border border-border bg-card text-foreground shadow-sm">
                <X className="h-2.5 w-2.5" />
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onClear} className="min-h-11 shrink-0 rounded-md px-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Tozalash
      </button>
    </section>
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
    size: CARD_PAGE_SIZE,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold">Mashhur META kartalar</h3>
        <span className="text-[11px] text-muted-foreground">11 tagacha tanlang</span>
      </div>
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
    size: CARD_PAGE_SIZE,
    skip: debounced.length < 2,
  });

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          aria-label="O‘yinchi nomi"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="O'yinchi nomi (masalan: Messi)"
          className="h-11 rounded-lg pl-10 pr-12"
        />
        {query && (
          <button type="button" aria-label="Qidiruvni tozalash" onClick={() => setQuery('')} className="absolute right-1 top-1 grid h-10 w-11 place-items-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="h-4 w-4" />
          </button>
        )}
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
    <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-7 sm:gap-2">
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
                'group min-h-11 w-full rounded-lg border bg-card p-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45',
                isPicked
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-border hover:border-primary/40 hover:bg-muted/30',
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
                <span aria-hidden="true" className={cn('absolute bottom-1 right-1 grid h-5 w-5 place-items-center rounded-full border shadow-sm', isPicked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card/90 text-transparent')}>
                  <Check className="h-3.5 w-3.5" />
                </span>
              </span>
              <span className="mt-1 block truncate text-[11px] font-semibold leading-4" title={card.name}>
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
    description: 'Qisman mos akkountlarni ham ko‘rsatadi. Ko‘proq tanlov.',
  },
  {
    value: 4,
    label: 'Muvozanatli',
    description: 'Moslik va natijalar soni o‘rtasidagi muvozanat. Tavsiya etiladi.',
  },
  {
    value: 8,
    label: 'Qat’iy',
    description: 'Yuqori moslikdagi akkountlar. Natijalar kamroq bo‘lishi mumkin.',
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
  canRemoveFilter,
  reducedMotion,
}: {
  chosenCount: number;
  minMatch: number;
  setMinMatch: (value: number) => void;
  onApply: () => void;
  canRemoveFilter: boolean;
  reducedMotion: boolean;
}) {
  const activeOption = getActiveStrictnessOption(minMatch);
  const strictnessId = useId();

  return (
    <div className="sticky bottom-0 shrink-0 border-t border-border bg-card px-3 pb-[calc(0.5rem+var(--app-content-safe-bottom))] pt-1 sm:px-4">
      {chosenCount > 0 && (
        <details className="group mb-1 max-h-[30dvh] overflow-y-auto overscroll-contain">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">Moslik darajasi</span>
            <span className="ml-auto text-muted-foreground">{activeOption.label}</span>
            <ChevronDown aria-hidden="true" className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" />
          </summary>
          <fieldset className="pb-3 pt-1">
            <legend className="sr-only">Qidiruv qat’iyligi</legend>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
              {STRICTNESS_OPTIONS.map((opt) => (
                <label key={opt.value} className="relative min-w-0 cursor-pointer">
                  <input
                    type="radio"
                    name={strictnessId}
                    value={opt.value}
                    checked={activeOption.value === opt.value}
                    onChange={() => {
                      setMinMatch(opt.value);
                      telegramHaptic(getTelegramWebApp(), 'selection', reducedMotion);
                    }}
                    className="peer sr-only"
                  />
                  <span className="flex min-h-11 items-center justify-center rounded-lg px-1 text-[11px] font-semibold text-muted-foreground transition-colors peer-checked:bg-card peer-checked:text-foreground peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-ring sm:text-xs">
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground" role="status">
              {activeOption.description}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Aynan tanlangan karta to‘liq, shu o‘yinchining boshqa kartasi qisman mos hisoblanadi.
            </p>
          </fieldset>
        </details>
      )}
      {chosenCount >= MAX_MATCH_PLAYERS && (
        <p className="mb-2 text-xs text-warning" role="status">
          Ko&apos;pi bilan 11 ta o&apos;yinchi. Yangisini tanlash uchun bittasini olib tashlang.
        </p>
      )}
      <Button
        onClick={onApply}
        disabled={chosenCount === 0 && !canRemoveFilter}
        className="h-11 w-full rounded-lg text-xs font-bold"
      >
        <Search aria-hidden="true" className="h-4 w-4" />
        {chosenCount > 0
          ? `${chosenCount} o‘yinchi bo‘yicha qidirish`
          : canRemoveFilter ? 'Filtrni olib tashlash' : 'O‘yinchi tanlang'}
      </Button>
    </div>
  );
}

function CardGridSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7 sm:gap-2">
      {Array.from({ length: CARD_PAGE_SIZE }).map((_, index) => (
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
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [automaticLoading, setAutomaticLoading] = useState(true);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setAutomaticLoading(false);
      return;
    }
    if (loading || error || !hasMore || !sentinelRef.current) return;

    let active = true;
    const observer = new IntersectionObserver((entries) => {
      if (!active || !entries.some((entry) => entry.isIntersecting)) return;
      active = false;
      observer.disconnect();
      onLoadMore();
    }, { rootMargin: '120px 0px' });
    observer.observe(sentinelRef.current);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [loading, error, hasMore, onLoadMore]);

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
    <div ref={sentinelRef} aria-label="Ko‘proq kartalar" className="mt-2 min-h-11 text-center">
      {automaticLoading ? (
        <p role="status" className="flex min-h-11 items-center justify-center gap-2 text-xs text-muted-foreground">
          {loading && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
          {loading ? 'Yuklanmoqda…' : `${count} / ${total} ta karta`}
        </p>
      ) : (
        <Button variant="outline" onClick={onLoadMore} disabled={loading} className="min-h-11">
          {loading ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : null}
          Yana yuklash ({count} / {total})
        </Button>
      )}
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
  const [reachedEnd, setReachedEnd] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);

  const key = useMemo(() => `${q ?? ''}|${tier ?? ''}|${size}`, [q, tier, size]);

  useEffect(() => {
    setPage(0);
    setCards([]);
    setTotal(0);
    setReachedEnd(false);
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
        setReachedEnd(payload.items.length === 0);
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
    hasMore: !reachedEnd && cards.length < total,
    loadMore: () => {
      if (!loading && !error && !reachedEnd && cards.length < total) setPage((current) => current + 1);
    },
    retry: () => setRetryVersion((current) => current + 1),
  };
}
