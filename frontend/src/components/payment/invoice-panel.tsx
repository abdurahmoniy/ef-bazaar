'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, Timer } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatPanForDisplay } from '@/lib/card-detect';
import {
  countdownAnnouncement,
  formatCountdown,
  invoiceBumpTiyin,
  secondsUntil,
  transferAmountForCopy,
} from '@/lib/invoice-view';
import { formatTiyin } from '@/lib/money';
import type { InvoiceResponse } from '@/lib/payment-types';
import { cn } from '@/lib/utils';

type CopyTarget = 'pan' | 'amount';

function useCountdown(expiresAt: string): number {
  const [left, setLeft] = useState(() => secondsUntil(expiresAt, Date.now()));
  useEffect(() => {
    setLeft(secondsUntil(expiresAt, Date.now()));
    const id = setInterval(() => setLeft(secondsUntil(expiresAt, Date.now())), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return left;
}

async function writeClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // Never surface the failure with the value in it — that value may be the PAN.
    return false;
  }
}

interface InvoicePanelProps {
  invoice: InvoiceResponse;
  /** Less nesting and smaller card digits when embedded in a chat dialog. */
  compact?: boolean;
  onExpired: () => void;
  /**
   * Clears the panel. Optional so a static render still works, but on the
   * wallet page it is the ONLY way this panel goes away — see `onExpired`.
   */
  onDismiss?: () => void;
}

/**
 * The transfer instructions. Everything here exists to make one number
 * arrive exactly right: a transfer that differs by a single tiyin cannot be
 * attributed to this invoice and lands in the admin's manual queue.
 *
 * `invoice.pan` is the full card number. This component is the only place it
 * may be rendered — it must never reach a log line, an error message, or any
 * analytics call.
 *
 * Past the deadline the panel STAYS, dimmed, with the card number still
 * readable: a user who was in their banking app when the clock ran out must be
 * able to finish or verify a transfer that is already in flight. Only the
 * explicit "Yangi so'rov" button clears it.
 */
export function InvoicePanel({ invoice, onExpired, onDismiss, compact = false }: InvoicePanelProps) {
  const secondsLeft = useCountdown(invoice.expiresAt);
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bumpTiyin = invoiceBumpTiyin(invoice);

  useEffect(() => {
    if (secondsLeft === 0) onExpired();
  }, [secondsLeft, onExpired]);

  // This panel unmounts routinely — a timer left running writes state into a
  // component that is gone.
  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  const copy = useCallback(async (value: string, what: CopyTarget) => {
    const ok = await writeClipboard(value);
    setCopyFailed(!ok);
    setCopied(ok ? what : null);
    if (!ok) return;
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(null), 2000);
  }, []);

  const running = secondsLeft > 0;

  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm transition-all',
        compact ? 'p-3' : 'p-4 sm:p-6',
        !running && 'opacity-85',
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <h2 className="text-base font-bold text-foreground sm:text-lg">
            Quyidagi kartaga o‘tkazing
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Mobil banking ilovangiz orqali ko‘rsatilgan kartaga pul o‘tkazing
          </p>
        </div>
        <span
          role="timer"
          aria-label={
            running
              ? `To‘lov muddati: ${formatCountdown(secondsLeft)}`
              : 'To‘lov muddati tugadi'
          }
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs sm:text-sm font-bold tabular-nums shadow-2xs transition-colors',
            running
              ? 'bg-primary/10 text-primary border border-primary/20'
              : 'bg-destructive/10 text-destructive border border-destructive/20',
          )}
        >
          <Timer className="h-4 w-4 shrink-0" aria-hidden="true" />
          {formatCountdown(secondsLeft)}
        </span>
      </header>

      {/* Polite, and threshold-based rather than per-second: a screen-reader
          user must learn the payment window is closing without the reader
          talking over them while they copy the card number. */}
      <p aria-live="polite" className="sr-only">
        {countdownAnnouncement(secondsLeft) ?? ''}
      </p>

      {/* Recipient Card Simulation */}
      <div className={cn('mt-4 rounded-2xl border border-border/80 bg-gradient-to-br from-primary/5 via-muted/30 to-card shadow-2xs', compact ? 'p-3' : 'p-4 sm:p-5')}>
        <dl className="space-y-4">
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <dt>Karta raqami</dt>
              <span className="text-[11px] font-medium text-muted-foreground/80">Uzcard / Humo</span>
            </div>
            <dd className="mt-1.5">
              <button
                type="button"
                onClick={() => copy(invoice.pan, 'pan')}
                className={cn('tap-press group flex w-full items-center justify-between rounded-xl border border-border/70 bg-card/90 px-3.5 py-2.5 font-mono font-bold text-foreground hover:border-primary/50 hover:bg-card shadow-2xs transition', compact ? 'text-sm tracking-normal' : 'text-lg tracking-wider sm:text-xl')}
                aria-label="Karta raqamidan nusxa olish"
              >
                <span className={compact ? 'min-w-0 whitespace-normal text-left' : 'truncate'}>{formatPanForDisplay(invoice.pan)}</span>
                <span className="ml-2 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted/80 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition">
                  {copied === 'pan' ? (
                    <Check className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  )}
                </span>
              </button>
              <p className="mt-2 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <span className="font-semibold text-foreground">{invoice.holderName}</span>
                <span>·</span>
                <span>{invoice.cardExpiry}</span>
              </p>
            </dd>
          </div>

          <div className="border-t border-border/60 pt-3">
            <dt className="text-xs font-semibold text-muted-foreground">O‘tkaziladigan summa</dt>
            <dd className="mt-1.5">
              <button
                type="button"
                onClick={() => copy(transferAmountForCopy(invoice.transferTiyin), 'amount')}
                className="tap-press group flex w-full items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2.5 text-foreground hover:bg-primary/10 transition shadow-2xs"
                aria-label="Summadan nusxa olish"
              >
                <span className="text-xl sm:text-2xl font-black tabular-nums text-primary">
                  {formatTiyin(invoice.transferTiyin)} so‘m
                </span>
                <span className="ml-2 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition">
                  {copied === 'amount' ? (
                    <Check className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  )}
                </span>
              </button>
            </dd>
          </div>
        </dl>

        {copied && (
          <p role="status" className="mt-2.5 text-xs sm:text-sm font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <Check className="h-3.5 w-3.5" />
            Nusxalandi
          </p>
        )}
        {copyFailed && (
          <p role="status" className="mt-2.5 text-xs sm:text-sm text-muted-foreground">
            Nusxalab bo‘lmadi — qo‘lda ko‘chiring.
          </p>
        )}
      </div>

      {bumpTiyin !== 0 && (
        <p className="mt-4 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3.5 text-xs sm:text-sm leading-relaxed text-amber-900 dark:text-amber-200">
          Siz {formatTiyin(invoice.requestedTiyin)} so‘m so‘radingiz, lekin o‘tkazish uchun{' '}
          {formatTiyin(invoice.transferTiyin)} so‘m ko‘rsatilgan. Ayni damda shu summada
          boshqa to‘lov ham kutilmoqda — tizim ularni ajrata olishi uchun summa biroz
          o‘zgartirildi. Hamyoningizga {formatTiyin(invoice.requestedTiyin)} so‘m tushadi.
        </p>
      )}

      <p className="mt-3.5 flex gap-2.5 rounded-xl bg-destructive/10 border border-destructive/20 p-3.5 text-xs sm:text-sm leading-relaxed text-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        <span>
          Summa <strong>aynan</strong> shunday bo‘lishi kerak. Bir so‘m kam yoki ko‘p
          bo‘lsa, tizim to‘lovni avtomatik aniqlay olmaydi va uni qo‘lda tekshirishga
          to‘g‘ri keladi.
        </span>
      </p>

      <p className="mt-3.5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
        {running
          ? 'To‘lov tushgach hamyoningiz shu yerda avtomatik yangilanadi — sahifani yangilash shart emas. '
            + 'Sahifani yopsangiz ham bo‘ladi, pul baribir tushadi.'
          : 'Muddat tugadi. Agar pulni allaqachon o‘tkazgan bo‘lsangiz, qayta o‘tkazmang — '
            + 'to‘lov qo‘lda tekshiriladi va hamyoningizga tushadi. Aks holda yangi so‘rov yarating.'}
      </p>

      {!running && onDismiss && (
        <Button
          type="button"
          variant="outline"
          onClick={onDismiss}
          className="mt-4 min-h-11 w-full rounded-xl font-semibold sm:w-auto shadow-2xs"
        >
          Yangi so‘rov
        </Button>
      )}
    </section>
  );
}
