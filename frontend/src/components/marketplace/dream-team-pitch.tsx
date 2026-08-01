'use client';

import { Plus, Star, X } from 'lucide-react';

import { cardRating, type DreamTeamSlot } from '@/lib/marketplace-types';
import { cn } from '@/lib/utils';

/**
 * Formation → slot layout, in percent of the pitch box. Origin is top-left,
 * GK at the bottom, so the user looks up the pitch the way the game presents
 * a squad screen.
 *
 * Adding a formation is a data change, never a layout change — the pitch
 * renders whatever coordinates it is handed.
 */
export const FORMATIONS: Record<string, Array<{ position: string; x: number; y: number }>> = {
  '4-3-3': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'LB', x: 15, y: 73 },
    { position: 'CB', x: 38, y: 77 },
    { position: 'CB', x: 62, y: 77 },
    { position: 'RB', x: 85, y: 73 },
    { position: 'CMF', x: 28, y: 50 },
    { position: 'DMF', x: 50, y: 56 },
    { position: 'CMF', x: 72, y: 50 },
    { position: 'LWF', x: 20, y: 22 },
    { position: 'CF', x: 50, y: 15 },
    { position: 'RWF', x: 80, y: 22 },
  ],
  '4-2-3-1': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'LB', x: 15, y: 73 },
    { position: 'CB', x: 38, y: 77 },
    { position: 'CB', x: 62, y: 77 },
    { position: 'RB', x: 85, y: 73 },
    { position: 'DMF', x: 36, y: 57 },
    { position: 'DMF', x: 64, y: 57 },
    { position: 'LMF', x: 18, y: 34 },
    { position: 'AMF', x: 50, y: 36 },
    { position: 'RMF', x: 82, y: 34 },
    { position: 'CF', x: 50, y: 13 },
  ],
  '3-5-2': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'CB', x: 27, y: 77 },
    { position: 'CB', x: 50, y: 80 },
    { position: 'CB', x: 73, y: 77 },
    { position: 'LMF', x: 12, y: 52 },
    { position: 'CMF', x: 34, y: 55 },
    { position: 'DMF', x: 50, y: 62 },
    { position: 'CMF', x: 66, y: 55 },
    { position: 'RMF', x: 88, y: 52 },
    { position: 'CF', x: 38, y: 17 },
    { position: 'CF', x: 62, y: 17 },
  ],
};

export const DEFAULT_FORMATION = '4-3-3';

/** Empty 11 slots for a formation — the starting point for a new squad. */
export function emptySlots(formation: string): DreamTeamSlot[] {
  return (FORMATIONS[formation] ?? FORMATIONS[DEFAULT_FORMATION]).map((spot, index) => ({
    index,
    position: spot.position,
    w: 1,
  }));
}

/**
 * Re-lay a squad onto a different formation, keeping the cards. Positions come
 * from the new shape; anything past its 11 slots is dropped.
 */
export function reshape(slots: DreamTeamSlot[], formation: string): DreamTeamSlot[] {
  return emptySlots(formation).map((slot, index) => ({
    ...slot,
    card: slots[index]?.card,
    w: slots[index]?.w ?? 1,
  }));
}

interface DreamTeamPitchProps {
  slots: DreamTeamSlot[];
  formation: string;
  onSlotClick?: (index: number) => void;
  onClear?: (index: number) => void;
  onToggleWeight?: (index: number) => void;
  /** Read-only rendering for previews — no add/remove affordances. */
  readOnly?: boolean;
  className?: string;
}

export function DreamTeamPitch({
  slots,
  formation,
  onSlotClick,
  onClear,
  onToggleWeight,
  readOnly = false,
  className,
}: DreamTeamPitchProps) {
  const layout = FORMATIONS[formation] ?? FORMATIONS[DEFAULT_FORMATION];

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-2xl border border-emerald-900/40 shadow-card',
        // Mown-grass stripes; the gradient overlay keeps cards readable near the top.
        'bg-[linear-gradient(180deg,rgba(0,0,0,0.35),transparent_35%),repeating-linear-gradient(180deg,#14532d_0px,#14532d_9%,#166534_9%,#166534_18%)]',
        className,
      )}
      style={{ aspectRatio: '3 / 4' }}
    >
      <PitchMarkings />

      {layout.map((spot, index) => {
        const slot = slots[index];
        return (
          <div
            key={index}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
          >
            <PitchSlot
              slot={slot}
              position={spot.position}
              readOnly={readOnly}
              onClick={() => onSlotClick?.(index)}
              onClear={() => onClear?.(index)}
              onToggleWeight={() => onToggleWeight?.(index)}
            />
          </div>
        );
      })}
    </div>
  );
}

/** Centre circle, halfway line and both boxes — enough to read as a pitch. */
function PitchMarkings() {
  return (
    <svg
      viewBox="0 0 300 400"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full text-white/20"
      aria-hidden
    >
      <rect x="8" y="8" width="284" height="384" fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1="8" y1="200" x2="292" y2="200" stroke="currentColor" strokeWidth="2" />
      <circle cx="150" cy="200" r="42" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="88" y="8" width="124" height="52" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="88" y="340" width="124" height="52" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function PitchSlot({
  slot,
  position,
  readOnly,
  onClick,
  onClear,
  onToggleWeight,
}: {
  slot?: DreamTeamSlot;
  position: string;
  readOnly: boolean;
  onClick: () => void;
  onClear: () => void;
  onToggleWeight: () => void;
}) {
  const card = slot?.card;
  const mustHave = (slot?.w ?? 1) > 1;

  if (!card) {
    return (
      <button
        type="button"
        onClick={readOnly ? undefined : onClick}
        disabled={readOnly}
        className={cn(
          'grid h-12 w-12 place-items-center rounded-full border-2 border-dashed border-white/40',
          'bg-black/25 text-[10px] font-black text-white/70 backdrop-blur-sm transition',
          !readOnly && 'hover:border-white hover:bg-black/40 hover:text-white',
        )}
        aria-label={`${position} tanlash`}
      >
        {readOnly ? position : <Plus className="h-4 w-4" />}
      </button>
    );
  }

  const rating = cardRating(card);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={readOnly ? undefined : onClick}
        disabled={readOnly}
        className={cn(
          'block w-14 rounded-lg border-2 bg-black/50 p-0.5 backdrop-blur-sm transition',
          mustHave ? 'border-amber-400' : 'border-white/50',
          !readOnly && 'hover:scale-105 hover:border-white',
        )}
        title={card.name}
      >
        <span className="relative block aspect-[12/17] overflow-hidden rounded">
          {card.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.imageUrl} alt={card.name} loading="lazy" className="h-full w-full object-contain" />
          ) : (
            <span className="grid h-full w-full place-items-center px-0.5 text-center text-[8px] font-bold leading-tight text-white">
              {card.name}
            </span>
          )}
          {typeof rating === 'number' && (
            <span className="absolute right-0 top-0 rounded-bl bg-primary px-1 text-[9px] font-black text-primary-foreground">
              {rating}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-center text-[8px] font-bold text-white">
          {card.name}
        </span>
      </button>

      {!readOnly && (
        <>
          <button
            type="button"
            onClick={onClear}
            className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-destructive text-destructive-foreground shadow"
            aria-label={`${card.name} olib tashlash`}
          >
            <X className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onToggleWeight}
            className={cn(
              'absolute -left-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full shadow transition',
              mustHave ? 'bg-amber-400 text-amber-950' : 'bg-white/80 text-black/60',
            )}
            aria-label={mustHave ? 'Oddiy slot qilish' : 'Muhim slot qilish'}
            title={mustHave ? 'Muhim — 3x vazn' : 'Oddiy — 1x vazn'}
          >
            <Star className={cn('h-3 w-3', mustHave && 'fill-current')} />
          </button>
        </>
      )}
    </div>
  );
}
