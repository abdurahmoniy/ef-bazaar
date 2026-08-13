'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';

import { formatListingDate } from '@/lib/marketplace-format';
import { formatTiyin } from '@/lib/money';
import type { PlatformCardResponse } from '@/lib/payment-types';
import { cn } from '@/lib/utils';

/**
 * Only the brands that need a prettier name than the enum's own. A brand added
 * to the backend later falls back to its raw value rather than to an empty
 * span — same rule as `UNKNOWN_KIND_LABEL` in `wallet-history.ts`.
 */
const BRAND_LABEL: Record<PlatformCardResponse['brand'], string> = {
  HUMO: 'HUMO',
  UZCARD: 'UZCARD',
  VISA: 'VISA',
  MC: 'Mastercard',
};

interface PlatformCardProps {
  card: PlatformCardResponse;
  /**
   * Position in the active queue, 1-based. Passed in rather than read from
   * `card.displayOrder` so an optimistic reorder shows the new numbers
   * immediately instead of the server's stale ones.
   */
  position?: number;
  busy?: boolean;
  onDeactivate: (id: string) => void;
  onActivate: (id: string) => void;
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
}

/**
 * One platform card, drawn as a card. `maskedPan` is all this screen ever
 * receives — the full number lives encrypted in payment-service and is
 * decrypted only when an invoice is issued.
 */
export function PlatformCard({
  card,
  position,
  busy = false,
  onDeactivate,
  onActivate,
  onMoveUp,
  onMoveDown,
}: PlatformCardProps) {
  const expiry = `${String(card.expiryMonth).padStart(2, '0')}/${String(card.expiryYear).slice(-2)}`;
  const brand = BRAND_LABEL[card.brand] ?? card.brand;

  return (
    <article
      aria-label={`${brand} ${card.maskedPan}`}
      className={cn(
        'flex aspect-[1.586/1] w-full flex-col justify-between rounded-2xl p-4 text-white shadow-card sm:p-5',
        card.active
          ? 'bg-gradient-to-br from-slate-700 to-slate-900'
          : 'bg-gradient-to-br from-slate-400 to-slate-500 opacity-70',
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <span className="text-sm font-black tracking-wide">{brand}</span>
        {card.active ? (
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold tabular-nums">
            #{position ?? card.displayOrder}
          </span>
        ) : (
          <span className="rounded-full bg-black/30 px-2 py-0.5 text-xs font-semibold">
            Faol emas
          </span>
        )}
      </header>

      <p className="font-mono text-lg tracking-widest sm:text-xl">{card.maskedPan}</p>

      <footer className="space-y-2">
        <div className="flex items-end justify-between gap-2 text-sm">
          <span className="min-w-0 truncate font-semibold uppercase">{card.holderName}</span>
          <span className="shrink-0 tabular-nums">{expiry}</span>
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-white/80">
          <span className="min-w-0 truncate tabular-nums">
            {/* A card that never received a transfer has an unknown balance,
                not a zero one — `0 so'm` would read as drained. */}
            {card.balanceTiyin != null
              ? `${formatTiyin(card.balanceTiyin)} so'm`
              : "Qoldiq hali ma'lum emas"}
            {card.balanceObservedAt && ` · ${formatListingDate(card.balanceObservedAt)}`}
          </span>

          {/* Every label names the card. On a grid of cards these buttons are
              otherwise N identical "Yuqoriga"/"O'chirish" to a screen reader,
              with nothing saying which card is about to change. The masked PAN
              is the only number this component ever holds. */}
          <span className="flex shrink-0 items-center gap-1">
            {onMoveUp && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onMoveUp(card.id)}
                aria-label={`${card.maskedPan} kartasini yuqoriga surish`}
                className="rounded-md p-1 transition hover:bg-white/20 disabled:opacity-40"
              >
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            {onMoveDown && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onMoveDown(card.id)}
                aria-label={`${card.maskedPan} kartasini pastga surish`}
                className="rounded-md p-1 transition hover:bg-white/20 disabled:opacity-40"
              >
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => (card.active ? onDeactivate(card.id) : onActivate(card.id))}
              aria-label={
                card.active
                  ? `${card.maskedPan} kartasini o'chirish`
                  : `${card.maskedPan} kartasini yoqish`
              }
              className="rounded-md px-2 py-1 font-semibold transition hover:bg-white/20 disabled:opacity-40"
            >
              {card.active ? "O'chirish" : 'Yoqish'}
            </button>
          </span>
        </div>
      </footer>
    </article>
  );
}
