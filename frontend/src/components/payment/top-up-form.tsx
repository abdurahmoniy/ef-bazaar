'use client';

import { useState } from 'react';
import { ArrowDownToLine, CheckCircle2, Loader2, ShieldCheck, Zap } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TipCallout } from '@/components/help/tip-callout';
import { formatTiyin, uzsToTiyin } from '@/lib/money';
import { createInvoice } from '@/lib/payment-client';
import type { InvoiceResponse } from '@/lib/payment-types';
import {
  TOP_UP_PRESETS,
  formatTopUpInput,
  parseTopUpAmount,
} from '@/lib/top-up-draft';

interface TopUpFormProps {
  onCreated: (invoice: InvoiceResponse) => void;
  /**
   * Pre-filled so'm amount. Set when the user was sent here by something that
   * knows what they are short — accepting a proposal the wallet cannot cover
   * arrives with exactly the missing amount, so they do not have to work it
   * out themselves.
   */
  initialAmount?: number;
}

/**
 * Asks for an amount and turns it into an invoice. The amount is validated
 * here only to save an obvious round trip — payment-service enforces the real
 * floor and answers with its own Uzbek message, which is what gets shown.
 */
export function TopUpForm({ onCreated, initialAmount }: TopUpFormProps) {
  const [amount, setAmount] = useState(
    initialAmount && initialAmount > 0 ? String(initialAmount) : '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(uzs: number) {
    setBusy(true);
    setError(null);
    try {
      onCreated(await createInvoice(uzs));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xatolik yuz berdi.');
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseTopUpAmount(amount);
    if (parsed.uzs === null) {
      setError(parsed.error);
      return;
    }
    void submit(parsed.uzs);
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-6 transition-all">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <ArrowDownToLine className="h-4.5 w-4.5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground sm:text-lg">Hamyonni to‘ldirish</h2>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
          <Zap className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
          0% komissiya
        </span>
      </div>

      <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
        Summani tanlang — keyingi qadamda karta raqami va o‘tkaziladigan summa
        ko‘rsatiladi.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TOP_UP_PRESETS.map((preset) => (
          <Button
            key={preset}
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void submit(preset)}
            className="min-h-12 rounded-xl border-border/80 font-bold tabular-nums text-foreground transition hover:border-primary/40 hover:bg-primary/5 active:scale-95 text-sm sm:text-base shadow-2xs"
          >
            {formatTiyin(uzsToTiyin(preset))}
          </Button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="mt-3.5 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label htmlFor="top-up-amount" className="text-xs font-semibold text-muted-foreground sm:col-span-2">
          Boshqa summa
        </label>
        <div className="relative min-w-0 flex-1">
          <Input
            id="top-up-amount"
            inputMode="numeric"
            autoComplete="off"
            value={amount}
            onChange={(event) => {
              setAmount(formatTopUpInput(event.target.value));
              setError(null);
            }}
            placeholder="Boshqa summa"
            className="h-11 rounded-xl pr-14 font-semibold tabular-nums border-border/80 focus-visible:ring-primary/20 text-sm sm:text-base"
          />
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
            so‘m
          </span>
        </div>
        <Button
          type="submit"
          disabled={busy}
          className="min-h-11 rounded-xl px-5 font-semibold transition active:scale-95 shadow-xs"
        >
          {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
          Davom etish
        </Button>
      </form>

      {error && (
        <p role="alert" className="mt-2.5 rounded-lg bg-destructive/10 px-3 py-2 text-xs sm:text-sm font-semibold text-destructive">
          {error}
        </p>
      )}

      <TipCallout
        variant="security"
        learnMoreHref="/help#how-to-top-up-wallet"
        learnMoreLabel="Batafsil"
        className="mt-4"
      >
        <strong>To‘lovni tekshirish:</strong> Keyingi qadamdagi aniq summa va karta raqamidan foydalaning. To‘lov tasdiqlangach balans yangilanadi; tekshirish biroz vaqt olishi mumkin.
      </TipCallout>
    </section>
  );
}
