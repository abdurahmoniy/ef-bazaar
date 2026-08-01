'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Flame, Loader2, Search, Sparkles, Users, X } from 'lucide-react';

import { DreamTeamPitch } from '@/components/marketplace/dream-team-pitch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';
import {
  cardRating,
  cardsFilterValue,
  dreamTeamFilterValue,
  type AttachedPlayerCard,
  type CardSearchResult,
  type DreamTeam,
} from '@/lib/marketplace-types';
import { cn } from '@/lib/utils';

type Tab = 'meta' | 'search' | 'team';

interface PlayerFilterDialogProps {
  /** The user's saved squads — empty when signed out. */
  teams: DreamTeam[];
  /** Cards already applied to the current browse, so the dialog opens in sync. */
  selected?: AttachedPlayerCard[];
  activeMinMatch?: number;
  /** Applies the chosen filter to the URL, preserving other filters. */
  onApply: (dreamTeam: string | undefined, minMatch: number) => void;
  activeCount: number;
}

const META_PAGE_SIZE = 24;
const DEBOUNCE_MS = 250;

/**
 * "META o'yinchilar" — the entry point for filtering accounts by who is in them.
 *
 * Three ways in, because buyers arrive with different amounts of intent:
 *   meta   — no idea yet, show what everyone wants right now (zero typing)
 *   search — has a name in mind
 *   team   — has a saved squad and wants accounts that cover it
 *
 * Matching is fuzzy on purpose (see card_match_score, V27): valuable_players
 * caps at 12 and sellers list only their stars, so demanding an exact squad
 * returns nothing. The threshold slider makes that tradeoff the user's.
 */
export function PlayerFilterDialog({
  teams,
  selected = [],
  activeMinMatch = 40,
  onApply,
  activeCount,
}: PlayerFilterDialogProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('meta');
  const [picked, setPicked] = useState<AttachedPlayerCard[]>(selected);
  const [minMatch, setMinMatch] = useState(activeMinMatch);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open]);

  // Reopening should reflect what is actually filtering right now, not the
  // leftovers of an abandoned edit.
  useEffect(() => {
    if (open) {
      setPicked(selected);
      setMinMatch(activeMinMatch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const activeTeam = teams.find((team) => team.id === activeTeamId) ?? null;

  function toggle(card: AttachedPlayerCard) {
    setActiveTeamId(null);
    setPicked((prev) =>
      prev.some((c) => c.efhubId === card.efhubId)
        ? prev.filter((c) => c.efhubId !== card.efhubId)
        : [...prev, card],
    );
  }

  function apply() {
    const value = activeTeam
      ? dreamTeamFilterValue(activeTeam.slots)
      : cardsFilterValue(picked);
    onApply(value, minMatch);
    setOpen(false);
  }

  function clearAll() {
    setPicked([]);
    setActiveTeamId(null);
    onApply(undefined, minMatch);
    setOpen(false);
  }

  const chosenCount = activeTeam
    ? activeTeam.slots.filter((slot) => slot.card).length
    : picked.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          'tap-press relative flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold sm:h-10 sm:px-3',
          'border border-amber-400/60 bg-gradient-to-br from-amber-400/20 via-amber-300/10 to-transparent',
          'text-amber-600 dark:text-amber-300',
          'shadow-[0_0_16px_-3px_rgba(251,191,36,0.65)] transition',
          'hover:border-amber-400 hover:shadow-[0_0_22px_-2px_rgba(251,191,36,0.85)]',
        )}
      >
        {/* Slow pulse ring — draws the eye without animating the label itself. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-pulse rounded-lg ring-1 ring-amber-400/40"
        />
        <Flame className="h-4 w-4" />
        <span className="hidden sm:inline">META</span>
        {activeCount > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-[11px] font-black text-amber-950">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Yopish"
            onClick={() => setOpen(false)}
            className="absolute inset-0 animate-fade-in cursor-default bg-black/60 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="O'yinchi bo'yicha filtr"
            className={cn(
              'absolute inset-x-0 bottom-0 flex max-h-[92dvh] animate-sheet-up flex-col rounded-t-2xl bg-card shadow-2xl',
              'sm:inset-0 sm:m-auto sm:h-[86vh] sm:max-w-4xl sm:rounded-2xl',
            )}
          >
            <DialogHeader tab={tab} setTab={setTab} onClose={() => setOpen(false)} />

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              {tab === 'meta' && (
                <MetaTab pickedIds={picked.map((c) => c.efhubId)} onToggle={toggle} />
              )}
              {tab === 'search' && (
                <SearchTab pickedIds={picked.map((c) => c.efhubId)} onToggle={toggle} />
              )}
              {tab === 'team' && (
                <TeamTab
                  teams={teams}
                  activeTeamId={activeTeamId}
                  onSelect={(id) => {
                    setActiveTeamId(id);
                    setPicked([]);
                  }}
                />
              )}
            </div>

            <DialogFooter
              chosenCount={chosenCount}
              minMatch={minMatch}
              setMinMatch={setMinMatch}
              onApply={apply}
              onClear={clearAll}
            />
          </div>
        </div>
      )}
    </>
  );
}

function DialogHeader({
  tab,
  setTab,
  onClose,
}: {
  tab: Tab;
  setTab: (tab: Tab) => void;
  onClose: () => void;
}) {
  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'meta', label: 'META', icon: <Flame className="h-4 w-4" /> },
    { id: 'search', label: 'Qidiruv', icon: <Search className="h-4 w-4" /> },
    { id: 'team', label: 'Mening jamoam', icon: <Users className="h-4 w-4" /> },
  ];
  return (
    <div className="shrink-0 border-b border-border">
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <span className="flex items-center gap-2 text-sm font-black">
          <Sparkles className="h-4 w-4 text-amber-500" />
          O&apos;yinchi bo&apos;yicha filtr
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Yopish"
          className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex gap-1 overflow-x-auto px-3 no-scrollbar">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-bold transition',
              tab === item.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MetaTab({
  pickedIds,
  onToggle,
}: {
  pickedIds: number[];
  onToggle: (card: AttachedPlayerCard) => void;
}) {
  const { cards, loading } = useCards({ tier: 'META', size: META_PAGE_SIZE });

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground">
        Hozir eng ko&apos;p qidirilayotgan kartalar. Tanlang — shu o&apos;yinchilar bor
        akkountlar yuqorida chiqadi.
      </p>
      {loading ? (
        <CardGridSkeleton />
      ) : cards.length === 0 ? (
        <EmptyState
          icon={<Flame className="h-8 w-8" />}
          title="META kartalar hali belgilanmagan"
          hint="Admin panelda /admin/players sahifasidan belgilang."
        />
      ) : (
        <CardGrid cards={cards} pickedIds={pickedIds} onToggle={onToggle} />
      )}
    </div>
  );
}

function SearchTab({
  pickedIds,
  onToggle,
}: {
  pickedIds: number[];
  onToggle: (card: AttachedPlayerCard) => void;
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query]);

  const { cards, loading } = useCards({ q: debounced, size: 30, skip: debounced.length < 2 });

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
      ) : loading ? (
        <CardGridSkeleton />
      ) : cards.length === 0 ? (
        <EmptyState
          icon={<Search className="h-8 w-8" />}
          title="Karta topilmadi"
          hint="Boshqa yozuvni sinab ko'ring."
        />
      ) : (
        <CardGrid cards={cards} pickedIds={pickedIds} onToggle={onToggle} />
      )}
    </div>
  );
}

function TeamTab({
  teams,
  activeTeamId,
  onSelect,
}: {
  teams: DreamTeam[];
  activeTeamId: string | null;
  onSelect: (id: string) => void;
}) {
  if (teams.length === 0) {
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

  const active = teams.find((team) => team.id === activeTeamId) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {teams.map((team) => (
          <button
            key={team.id}
            type="button"
            onClick={() => onSelect(team.id)}
            className={cn(
              'tap-press rounded-lg border px-2.5 py-1.5 text-xs font-bold transition',
              team.id === activeTeamId
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            {team.name}
            <span className="ml-1.5 text-[10px] font-semibold opacity-70">
              {team.slots.filter((slot) => slot.card).length}/11
            </span>
          </button>
        ))}
      </div>
      {active && (
        <div className="mx-auto max-w-sm">
          <DreamTeamPitch slots={active.slots} formation={active.formation} readOnly />
        </div>
      )}
      <Button asChild size="sm" variant="outline" className="w-full">
        <a href="/dream-team">Jamoani tahrirlash</a>
      </Button>
    </div>
  );
}

function CardGrid({
  cards,
  pickedIds,
  onToggle,
}: {
  cards: CardSearchResult[];
  pickedIds: number[];
  onToggle: (card: AttachedPlayerCard) => void;
}) {
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
      {cards.map((card) => {
        const isPicked = pickedIds.includes(card.efhubId);
        const rating = cardRating(card);
        return (
          <li key={card.efhubId}>
            <button
              type="button"
              onClick={() =>
                onToggle({
                  efhubId: card.efhubId,
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
                'w-full rounded-xl border bg-card p-1.5 text-left transition',
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
  minMatch,
  setMinMatch,
  onApply,
  onClear,
}: {
  chosenCount: number;
  minMatch: number;
  setMinMatch: (value: number) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  return (
    <div className="shrink-0 space-y-3 border-t border-border bg-card px-4 py-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-bold">
          <span>Minimal moslik</span>
          <span className="text-primary">{minMatch}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={10}
          value={minMatch}
          onChange={(event) => setMinMatch(Number(event.target.value))}
          className="w-full accent-primary"
          aria-label="Minimal moslik foizi"
        />
        <p className="text-[11px] font-semibold text-muted-foreground">
          Akkountda tanlangan o&apos;yinchilarning kamida shuncha qismi bo&apos;lsin.
          Bir xil o&apos;yinchining boshqa kartasi ham hisobga olinadi.
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

  const key = useMemo(() => `${q ?? ''}|${tier ?? ''}|${size}`, [q, tier, size]);

  const load = useCallback(async (signal: AbortSignal) => {
    const params = new URLSearchParams({ size: String(size) });
    if (q) params.set('q', q);
    if (tier) params.set('tier', tier);
    const response = await fetch(buildMarketplaceApiPath('v1/cards', params), {
      headers: { Accept: 'application/json' },
      credentials: 'include',
      signal,
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as { items?: CardSearchResult[] };
    return Array.isArray(payload.items) ? payload.items : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (skip) {
      setCards([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    load(controller.signal)
      .then(setCards)
      .catch((error) => {
        if ((error as Error).name !== 'AbortError') setCards([]);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [load, skip]);

  return { cards, loading };
}
