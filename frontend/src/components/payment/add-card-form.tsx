'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatPanForDisplay } from '@/lib/card-detect';
import { createPlatformCard } from '@/lib/payment-admin-client';
import {
  formatHolderInput,
  reviewPlatformCardDraft,
} from '@/lib/platform-card-draft';

interface AddCardFormProps {
  onAdded: () => void;
}

/**
 * Adds a platform card. Every decision it makes lives in
 * `platform-card-draft.ts`; this component only holds strings and calls the API.
 *
 * The full PAN is in component state while the admin types — unavoidable, and
 * the only place it is allowed to be. It goes straight to `createPlatformCard`
 * and is cleared on success. It must never reach a log, an error message or
 * anything else.
 */
export function AddCardForm({ onAdded }: AddCardFormProps) {
  const [pan, setPan] = useState('');
  const [holder, setHolder] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const review = reviewPlatformCardDraft({
    pan,
    holderName: holder,
    expiryMonth: month,
    expiryYear: year,
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!review.request || busy) return;

    setBusy(true);
    setError(null);
    try {
      await createPlatformCard(review.request);
      setPan('');
      setHolder('');
      setMonth('');
      setYear('');
      onAdded();
    } catch (err) {
      // The backend's own Uzbek message (duplicate last4, bad Luhn) or a
      // generic fallback. Never the number.
      setError(err instanceof Error ? err.message : "Karta qo'shilmadi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-card sm:p-6"
    >
      <h2 className="text-base font-black text-foreground">Yangi karta qo&apos;shish</h2>
      <p className="text-sm text-muted-foreground">
        Foydalanuvchilar mana shu kartalarga pul o&apos;tkazadi. Kamida bitta faol karta
        bo&apos;lmasa, hisob to&apos;ldirish ishlamaydi.
      </p>

      <div>
        <label htmlFor="platform-card-pan" className="sr-only">
          Karta raqami
        </label>
        <Input
          id="platform-card-pan"
          inputMode="numeric"
          autoComplete="off"
          value={pan}
          onChange={(event) => setPan(formatPanForDisplay(event.target.value))}
          placeholder="Karta raqami"
          className="font-mono tracking-widest"
        />
        <p className="mt-1 text-xs text-muted-foreground">{review.panMessage}</p>
      </div>

      <div>
        <label htmlFor="platform-card-holder" className="sr-only">
          Karta egasi
        </label>
        <Input
          id="platform-card-holder"
          autoComplete="off"
          value={holder}
          onChange={(event) => setHolder(formatHolderInput(event.target.value))}
          placeholder="KARTA EGASI"
          className="uppercase"
        />
      </div>

      <div>
        <div className="flex gap-2">
          <label htmlFor="platform-card-month" className="sr-only">
            Amal qilish oyi
          </label>
          <Input
            id="platform-card-month"
            inputMode="numeric"
            autoComplete="off"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            placeholder="Oy"
            className="w-24 tabular-nums"
          />
          <label htmlFor="platform-card-year" className="sr-only">
            Amal qilish yili
          </label>
          <Input
            id="platform-card-year"
            inputMode="numeric"
            autoComplete="off"
            value={year}
            onChange={(event) => setYear(event.target.value)}
            placeholder="Yil"
            className="w-28 tabular-nums"
          />
        </div>
        {review.expiryMessage && (
          <p className="mt-1 text-xs font-semibold text-destructive">{review.expiryMessage}</p>
        )}
      </div>

      {/* Disabled until the draft is good: a typo becomes a dead button rather
          than a round trip that comes back as an English 400. */}
      <Button type="submit" disabled={busy || !review.canSubmit} className="min-h-11">
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        Qo&apos;shish
      </Button>

      {error && (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
