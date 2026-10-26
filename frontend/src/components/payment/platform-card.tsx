'use client';

import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useState } from 'react';

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

/**
 * A tint per brand, used as a 8px marker beside the name — never as the only
 * thing identifying it. The label is always right next to it.
 */
const BRAND_TINT: Record<PlatformCardResponse['brand'], string> = {
  HUMO: '#22B07D',
  UZCARD: '#7C6CD4',
  VISA: '#4A7BD4',
  MC: '#D4794A',
};

export interface CardThroughput {
  throughputTiyin: number;
  paidInvoices: number;
}

interface PlatformCardProps {
  card: PlatformCardResponse;
  /**
   * Position in the active queue, 1-based. Passed in rather than read from
   * `card.displayOrder` so an optimistic reorder shows the new numbers
   * immediately instead of the server's stale ones.
   */
  position?: number;
  /**
   * Settled volume through this card. Absent when the analytics read failed —
   * which must not blank the row: the card still has to be manageable.
   */
  throughput?: CardThroughput;
  /** The widest throughput in the list, so every bar shares one scale. */
  throughputScaleTiyin?: number;
  busy?: boolean;
  onDeactivate: (id: string) => void;
  onActivate: (id: string) => void;
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
  /**
   * Absent when deleting is not on offer. The backend refuses a card any
   * payment ever referenced, so the row shows the error rather than hiding the
   * button — an admin needs to be told why, not left guessing.
   */
  onDelete?: (id: string) => void;
}

/**
 * One platform card, as a row in the allocation queue.
 *
 * `maskedPan` is all this screen ever receives — the full number lives
 * encrypted in payment-service and is decrypted only when an invoice is issued.
 * Nothing here may put a longer run of digits into an accessible name.
 */
export function PlatformCard({
  card,
  position,
  throughput,
  throughputScaleTiyin = 0,
  busy = false,
  onDeactivate,
  onActivate,
  onMoveUp,
  onMoveDown,
  onDelete,
}: PlatformCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const expiry = `${String(card.expiryMonth).padStart(2, '0')}/${String(card.expiryYear).slice(-2)}`;
  const brand = BRAND_LABEL[card.brand] ?? card.brand;
  const tint = BRAND_TINT[card.brand] ?? '#8B94A7';
  const barPercent = throughputScaleTiyin > 0 && throughput
    ? (throughput.throughputTiyin / throughputScaleTiyin) * 100
    : 0;

  return (
    <article
      aria-label={`${brand} ${card.maskedPan}`}
      className={cn(
        'rounded-2xl border border-border bg-card p-4',
        !card.active && 'border-dashed bg-muted/40',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        {card.active ? (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-black tabular-nums text-foreground">
            #{position ?? card.displayOrder}
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
            Faol emas
          </span>
        )}

        <div className="min-w-[11rem]">
          <p className="flex items-center gap-2 text-[0.7rem] font-black uppercase tracking-wider text-muted-foreground">
            <span
              className="h-2 w-2 shrink-0 rounded-sm"
              style={{ backgroundColor: tint }}
              aria-hidden="true"
            />
            {brand}
          </p>
          <p className="mt-1 font-mono text-sm tracking-wider text-foreground">
            {card.maskedPan}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {card.holderName} · <span className="tabular-nums">{expiry}</span>
          </p>
        </div>

        {throughput && (
          <div className="min-w-[9rem] flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-muted-foreground">Aylanma</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatTiyin(throughput.throughputTiyin)} so&apos;m ·{' '}
                {throughput.paidInvoices} ta
              </span>
            </div>
            <div className="mt-1.5 h-2.5 rounded bg-muted" aria-hidden="true">
              <div
                className="h-full rounded"
                style={{ width: `${barPercent}%`, backgroundColor: 'hsl(var(--success))' }}
              />
            </div>
          </div>
        )}

        <div className="min-w-[8rem] sm:text-right">
          <p className="text-xs text-muted-foreground">Qoldiq</p>
          <p className="text-sm font-bold tabular-nums text-foreground">
            {/* A card that never received a transfer has an unknown balance,
                not a zero one — `0 so'm` would read as drained. */}
            {card.balanceTiyin != null
              ? `${formatTiyin(card.balanceTiyin)} so'm`
              : "Qoldiq hali ma'lum emas"}
          </p>
          {card.balanceObservedAt && (
            <p className="text-xs text-muted-foreground">
              {formatListingDate(card.balanceObservedAt)}
            </p>
          )}
        </div>

        {/* Every label names the card. On a list of cards these icon buttons
            are otherwise N identical "Yuqoriga" to a screen reader, with
            nothing saying which card is about to change. The masked PAN is the
            only number this component ever holds. */}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {onMoveUp && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onMoveUp(card.id)}
              aria-label={`${card.maskedPan} kartasini yuqoriga surish`}
              className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted disabled:opacity-40"
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
              className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted disabled:opacity-40"
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
                ? `${card.maskedPan} kartasini faolsizlantirish`
                : `${card.maskedPan} kartasini yoqish`
            }
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground transition hover:bg-muted disabled:opacity-40"
          >
            {card.active ? 'Faolsizlantirish' : 'Yoqish'}
          </button>
          {onDelete && !confirmingDelete && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmingDelete(true)}
              aria-label={`${card.maskedPan} kartasini butunlay o'chirish`}
              className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-destructive disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Deleting cannot be undone and no screen in this panel can put the row
          back, so it takes a second, deliberate click. Inline rather than a
          modal: the row it is about stays on screen and visible. */}
      {onDelete && confirmingDelete && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <p className="mr-auto text-sm text-muted-foreground">
            Bu karta butunlay o&apos;chirilsinmi? Qaytarib bo&apos;lmaydi.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmingDelete(false)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground transition hover:bg-muted disabled:opacity-40"
          >
            Bekor qilish
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setConfirmingDelete(false);
              onDelete(card.id);
            }}
            aria-label={`${card.maskedPan} kartasini o'chirishni tasdiqlash`}
            className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-bold text-destructive-foreground transition hover:opacity-90 disabled:opacity-40"
          >
            Ha, o&apos;chirilsin
          </button>
        </div>
      )}
    </article>
  );
}
