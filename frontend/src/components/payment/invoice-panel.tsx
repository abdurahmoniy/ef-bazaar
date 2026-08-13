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
export function InvoicePanel({ invoice, onExpired, onDismiss }: InvoicePanelProps) {
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
        'rounded-xl border border-border bg-card p-4 shadow-card sm:p-6',
        !running && 'opacity-75',
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-black text-foreground">
          Quyidagi kartaga o‘tkazing
        </h2>
        <span
          role="timer"
          aria-label={
            running
              ? `To‘lov muddati: ${formatCountdown(secondsLeft)}`
              : 'To‘lov muddati tugadi'
          }
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums',
            running ? 'bg-accent text-accent-foreground' : 'bg-destructive/10 text-destructive',
          )}
        >
          <Timer className="h-4 w-4" aria-hidden="true" />
          {formatCountdown(secondsLeft)}
        </span>
      </header>

      {/* Polite, and threshold-based rather than per-second: a screen-reader
          user must learn the payment window is closing without the reader
          talking over them while they copy the card number. */}
      <p aria-live="polite" className="sr-only">
        {countdownAnnouncement(secondsLeft) ?? ''}
      </p>

      <dl className="mt-5 space-y-5">
        <div>
          <dt className="text-sm text-muted-foreground">Karta raqami</dt>
          <dd className="mt-1">
            <button
              type="button"
              onClick={() => copy(invoice.pan, 'pan')}
              className="tap-press inline-flex items-center gap-2 rounded-lg font-mono text-xl font-semibold tracking-wider text-foreground"
              aria-label="Karta raqamidan nusxa olish"
            >
              {formatPanForDisplay(invoice.pan)}
              {copied === 'pan'
                ? <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                : <Copy className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
            </button>
            <p className="mt-1 text-sm text-muted-foreground">
              {invoice.holderName} · {invoice.cardExpiry}
            </p>
          </dd>
        </div>

        <div>
          <dt className="text-sm text-muted-foreground">O‘tkaziladigan summa</dt>
          <dd className="mt-1">
            <button
              type="button"
              onClick={() => copy(transferAmountForCopy(invoice.transferTiyin), 'amount')}
              className="tap-press inline-flex items-center gap-2 rounded-lg text-2xl font-black tabular-nums text-foreground"
              aria-label="Summadan nusxa olish"
            >
              {formatTiyin(invoice.transferTiyin)} so‘m
              {copied === 'amount'
                ? <Check className="h-5 w-5 text-primary" aria-hidden="true" />
                : <Copy className="h-5 w-5 text-muted-foreground" aria-hidden="true" />}
            </button>
          </dd>
        </div>
      </dl>

      {copied && (
        <p role="status" className="mt-2 text-sm font-semibold text-primary">
          Nusxalandi
        </p>
      )}
      {copyFailed && (
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          Nusxalab bo‘lmadi — qo‘lda ko‘chiring.
        </p>
      )}

      {bumpTiyin !== 0 && (
        <p className="mt-5 rounded-lg bg-accent p-3 text-sm leading-6 text-accent-foreground">
          Siz {formatTiyin(invoice.requestedTiyin)} so‘m so‘radingiz, lekin o‘tkazish uchun{' '}
          {formatTiyin(invoice.transferTiyin)} so‘m ko‘rsatilgan. Ayni damda shu summada
          boshqa to‘lov ham kutilmoqda — tizim ularni ajrata olishi uchun summa biroz
          o‘zgartirildi. Hamyoningizga {formatTiyin(invoice.requestedTiyin)} so‘m tushadi.
        </p>
      )}

      <p className="mt-3 flex gap-2 rounded-lg bg-destructive/10 p-3 text-sm leading-6 text-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        <span>
          Summa <strong>aynan</strong> shunday bo‘lishi kerak. Bir so‘m kam yoki ko‘p
          bo‘lsa, tizim to‘lovni avtomatik aniqlay olmaydi va uni qo‘lda tekshirishga
          to‘g‘ri keladi.
        </span>
      </p>

      <p className="mt-3 text-sm text-muted-foreground">
        {running
          ? 'To‘lov tushgach hamyoningiz avtomatik to‘ldiriladi. Sahifani yopsangiz ham bo‘ladi.'
          : 'Muddat tugadi. Agar pulni allaqachon o‘tkazgan bo‘lsangiz, qayta o‘tkazmang — '
            + 'to‘lov qo‘lda tekshiriladi va hamyoningizga tushadi. Aks holda yangi so‘rov yarating.'}
      </p>

      {!running && onDismiss && (
        <Button
          type="button"
          variant="outline"
          onClick={onDismiss}
          className="mt-3 min-h-11 w-full sm:w-auto"
        >
          Yangi so‘rov
        </Button>
      )}
    </section>
  );
}
