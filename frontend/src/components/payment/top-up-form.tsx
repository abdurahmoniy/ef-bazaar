'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
    <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-6">
      <h2 className="text-base font-black text-foreground">Hamyonni to‘ldirish</h2>
      <p className="mt-1 text-sm text-muted-foreground">
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
            className="min-h-11 tabular-nums"
          >
            {formatTiyin(uzsToTiyin(preset))}
          </Button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="mt-3 flex flex-wrap gap-2">
        <label htmlFor="top-up-amount" className="sr-only">
          Boshqa summa
        </label>
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
          className="min-w-0 flex-1 tabular-nums"
        />
        <Button type="submit" disabled={busy} className="min-h-11">
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Davom etish
        </Button>
      </form>

      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
