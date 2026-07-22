'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';

import { PlayerCardTile } from '@/components/marketplace/player-card-tile';
import { Input } from '@/components/ui/input';
import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';
import { cn } from '@/lib/utils';

export interface PlayerCard {
  efhubId: number;
  name: string;
  team?: string;
  position?: string;
  playingStyle?: string;
  overallRating?: number;
  cardType?: string;
  imageUrl?: string;
  skills?: string[];
}

interface CardPickerProps {
  mode: 'single' | 'multi';
  value: PlayerCard[];
  onChange?: (next: PlayerCard[]) => void;
  max?: number;
  placeholder?: string;
  id?: string;
  className?: string;
  /** How selected cards render: text pill (default) or square image-only tile. */
  selectedVariant?: 'pill' | 'tile';
}

const DEBOUNCE_MS = 250;
const MIN_QUERY = 2;
const MAX_RESULTS = 20;

/**
 * Full-card picker — the caller owns an array of {@link PlayerCard} entities
 * and rendering / filtering downstream can key off any field
 * (efhubId, type, rating, skills, …). This is the source of truth for the
 * listing form's {@code valuable_players} and for the marketplace card
 * filter; both consume {@code onChange}'s {@link PlayerCard}[] directly
 * instead of a serialized name string.
 */
export function CardPicker({
  mode,
  value,
  onChange,
  max = 12,
  placeholder = "O'yinchi qidirish (masalan: Messi)",
  id,
  className,
  selectedVariant = 'pill',
}: CardPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayerCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (trimmedQuery.length < MIN_QUERY) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const handle = window.setTimeout(async () => {
      try {
        const url = buildMarketplaceApiPath(
          'v1/cards/search',
          new URLSearchParams({ q: trimmedQuery }),
        );
        const response = await fetch(url, {
          headers: { Accept: 'application/json' },
          credentials: 'include',
          signal: controller.signal,
        });
        if (!response.ok) {
          setResults([]);
          return;
        }
        const payload = (await response.json()) as unknown;
        setResults(
          Array.isArray(payload)
            ? (payload as PlayerCard[])
                .filter((card) => card && typeof card.efhubId === 'number' && typeof card.name === 'string')
                .slice(0, MAX_RESULTS)
            : [],
        );
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setResults([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [trimmedQuery]);

  useEffect(() => {
    function onDown(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const selectedIds = useMemo(
    () => new Set(value.map((card) => card.efhubId)),
    [value],
  );

  const selectCard = useCallback(
    (card: PlayerCard) => {
      if (mode === 'single') {
        onChange?.([card]);
        setQuery('');
        setOpen(false);
        inputRef.current?.blur();
        return;
      }
      if (selectedIds.has(card.efhubId)) return;
      if (value.length >= max) return;
      onChange?.([...value, card]);
      setQuery('');
      setActiveIndex(-1);
      inputRef.current?.focus();
    },
    [mode, onChange, value, max, selectedIds],
  );

  const removeCard = useCallback(
    (efhubId: number) => {
      onChange?.(value.filter((card) => card.efhubId !== efhubId));
    },
    [onChange, value],
  );

  const isMultiFull = mode === 'multi' && value.length >= max;
  const showDropdown = open && trimmedQuery.length >= MIN_QUERY;

  const handleKey = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showDropdown) {
        if (event.key === 'ArrowDown' && trimmedQuery.length >= MIN_QUERY) setOpen(true);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((prev) => (results.length === 0 ? -1 : (prev + 1) % results.length));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((prev) =>
          results.length === 0 ? -1 : (prev - 1 + results.length) % results.length,
        );
      } else if (event.key === 'Enter') {
        if (activeIndex >= 0 && activeIndex < results.length) {
          event.preventDefault();
          selectCard(results[activeIndex]);
        }
      } else if (event.key === 'Escape') {
        setOpen(false);
      }
    },
    [showDropdown, results, activeIndex, selectCard, trimmedQuery.length],
  );

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {value.length > 0 && (
        <div
          className={cn(
            'mb-2 flex flex-wrap gap-1.5',
            (mode === 'single' || selectedVariant === 'tile') && 'gap-2',
          )}
        >
          {value.map((card) =>
            selectedVariant === 'tile' ? (
              <SelectedTile
                key={card.efhubId}
                card={card}
                onRemove={() => removeCard(card.efhubId)}
              />
            ) : (
              <SelectedPill
                key={card.efhubId}
                card={card}
                variant={mode === 'single' ? 'primary' : 'muted'}
                onRemove={() => removeCard(card.efhubId)}
              />
            ),
          )}
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
          disabled={isMultiFull}
          placeholder={isMultiFull ? `Maksimum ${max} ta tanlangan` : placeholder}
          className="h-11 pl-9 pr-9"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {showDropdown && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-96 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
          {!loading && results.length === 0 && (
            <div className="p-3 text-center text-sm text-muted-foreground">Karta topilmadi</div>
          )}
          {results.map((card, index) => (
            <CardOption
              key={card.efhubId}
              card={card}
              active={activeIndex === index}
              disabled={mode === 'multi' && selectedIds.has(card.efhubId)}
              onSelect={() => selectCard(card)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SelectedTile({ card, onRemove }: { card: PlayerCard; onRemove: () => void }) {
  return (
    <PlayerCardTile card={card}>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${card.name} - o'chirish`}
        className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
      >
        <X className="h-3 w-3" />
      </button>
    </PlayerCardTile>
  );
}

function SelectedPill({
  card,
  onRemove,
  variant = 'muted',
}: {
  card: PlayerCard;
  onRemove: () => void;
  variant?: 'muted' | 'primary';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2 text-xs shadow-sm',
        variant === 'primary'
          ? 'border-primary bg-primary/5'
          : 'border-border bg-card',
      )}
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-muted">
        {card.imageUrl ? (
          <img
            src={card.imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            onError={(event) => {
              (event.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : null}
      </span>
      <span className="flex min-w-0 items-center gap-1">
        <span
          className={cn(
            'max-w-[9rem] truncate font-bold',
            variant === 'primary' ? 'text-primary' : 'text-foreground',
          )}
        >
          {card.name}
        </span>
        {typeof card.overallRating === 'number' && (
          <span className="rounded bg-primary px-1 py-0.5 text-[10px] font-black leading-none text-primary-foreground">
            {card.overallRating}
          </span>
        )}
        {card.cardType && (
          <span className="hidden text-[9px] font-black uppercase tracking-wide text-muted-foreground sm:inline">
            {card.cardType}
          </span>
        )}
      </span>
      <RemoveButton onRemove={onRemove} label={card.name} variant={variant} />
    </span>
  );
}

function RemoveButton({
  onRemove,
  label,
  variant,
}: {
  onRemove: () => void;
  label: string;
  variant: 'muted' | 'primary';
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`${label} - o'chirish`}
      className={cn(
        'grid h-4 w-4 place-items-center rounded-full transition',
        variant === 'primary'
          ? 'text-primary/70 hover:bg-primary/10 hover:text-primary'
          : 'text-muted-foreground hover:bg-destructive/20 hover:text-destructive',
      )}
    >
      <X className="h-3 w-3" />
    </button>
  );
}

function CardOption({
  card,
  active,
  disabled,
  onSelect,
}: {
  card: PlayerCard;
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault();
        if (!disabled) onSelect();
      }}
      className={cn(
        'flex w-full items-center gap-3 border-b border-border/60 px-3 py-2 text-left transition last:border-b-0',
        active ? 'bg-accent/60' : 'bg-transparent',
        disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-accent/60',
      )}
    >
      <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded bg-muted">
        {card.imageUrl ? (
          <img
            src={card.imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-contain"
            onError={(event) => {
              const target = event.target as HTMLImageElement;
              target.style.display = 'none';
            }}
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 truncate text-sm font-bold text-foreground">{card.name}</span>
          {typeof card.overallRating === 'number' && (
            <span className="ml-auto shrink-0 rounded bg-primary px-1.5 py-0.5 text-[10px] font-black text-primary-foreground">
              {card.overallRating}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {card.position && (
            <span className="rounded bg-muted px-1 py-0.5 font-semibold text-foreground/80">
              {card.position}
            </span>
          )}
          {card.playingStyle && <span className="truncate">{card.playingStyle}</span>}
          {card.cardType && (
            <span className="ml-auto shrink-0 text-[10px] font-black uppercase tracking-wide text-primary/70">
              {card.cardType}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
