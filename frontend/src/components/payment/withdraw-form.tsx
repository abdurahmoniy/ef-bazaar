'use client';

import { useState, useTransition } from 'react';
import { ArrowUpFromLine } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatTiyin } from '@/lib/money';
import {
  createWithdrawal,
  DRAFT_PROBLEM_UZ,
  formatPan,
  normalizeHolderName,
  validateDraft,
  type WithdrawalTicket,
} from '@/lib/withdrawal';

interface WithdrawFormProps {
  availableTiyin: number;
  /** Contact hint sent with the ticket; the server treats userId as authority. */
  telegramUsername?: string | null;
  onCreated: (ticket: WithdrawalTicket) => void;
}

/**
 * Opens a payout ticket.
 *
 * <p>The money is frozen the moment this succeeds, so the copy says "frozen",
 * not "sent" — an admin still has to make the transfer by hand.
 */
export function WithdrawForm({
  availableTiyin,
  telegramUsername,
  onCreated,
}: WithdrawFormProps) {
  const [open, setOpen] = useState(false);
  const [som, setSom] = useState('');
  const [pan, setPan] = useState('');
  const [holderName, setHolderName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  const amountTiyin = Math.round(Number(som.replace(/\s/g, '')) * 100) || 0;

  function submit() {
    setError(null);
    const draft = { amountTiyin, pan, holderName, phone, telegramUsername: telegramUsername ?? undefined };
    const problem = validateDraft(draft, availableTiyin);
    if (problem) {
      setError(DRAFT_PROBLEM_UZ[problem]);
      return;
    }
    startSubmit(async () => {
      const result = await createWithdrawal(draft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onCreated(result.data);
      setOpen(false);
      setSom('');
      setPan('');
      setHolderName('');
      setPhone('');
    });
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => setOpen(true)}
        disabled={availableTiyin <= 0}
      >
        <ArrowUpFromLine className="mr-2 h-4 w-4" aria-hidden="true" />
        Pul yechish
      </Button>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <h2 className="mb-3 text-sm font-bold text-foreground">Pul yechish so‘rovi</h2>

      <div className="space-y-3">
        <div>
          <Label htmlFor="wd-amount">Summa (so‘m)</Label>
          <div className="flex gap-2">
            <Input
              id="wd-amount"
              inputMode="numeric"
              value={som}
              onChange={(e) => setSom(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="0"
            />
            {/* Fills the whole spendable balance — the "magnet" that saves
                typing a number the form would then have to bounce. */}
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSom(String(Math.floor(availableTiyin / 100)))}
            >
              Hammasi
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Mavjud: {formatTiyin(availableTiyin)} so‘m
          </p>
        </div>

        <div>
          <Label htmlFor="wd-pan">Karta raqami</Label>
          <Input
            id="wd-pan"
            inputMode="numeric"
            autoComplete="cc-number"
            value={pan}
            onChange={(e) => setPan(formatPan(e.target.value))}
            placeholder="8600 0000 0000 0000"
          />
        </div>

        <div>
          <Label htmlFor="wd-holder">Karta egasi</Label>
          <Input
            id="wd-holder"
            value={holderName}
            onChange={(e) => setHolderName(normalizeHolderName(e.target.value))}
            placeholder="ALI VALIYEV"
          />
        </div>

        <div>
          <Label htmlFor="wd-phone">Telefon raqam</Label>
          <Input
            id="wd-phone"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+998 90 123 45 67"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Admin siz bilan bog‘lanishi uchun
          </p>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <p className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        So‘rov yuborilgach summa hamyoningizda muzlatiladi va admin kartangizga
        o‘tkazgach yechiladi. Rad etilsa to‘liq qaytariladi.
      </p>

      <div className="mt-3 flex gap-2">
        <Button type="button" className="flex-1" onClick={submit} disabled={submitting}>
          {submitting ? 'Yuborilmoqda…' : 'So‘rov yuborish'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
          Bekor
        </Button>
      </div>
    </section>
  );
}
