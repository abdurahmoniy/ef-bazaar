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
  MIN_WITHDRAWAL_TIYIN,
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
  defaultOpen?: boolean;
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
  defaultOpen = false,
}: WithdrawFormProps) {
  const [open, setOpen] = useState(defaultOpen);
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
      try {
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
      } catch {
        setError('So‘rov yuborilmadi. Internet aloqasini tekshirib, qayta urinib ko‘ring.');
      }
    });
  }

  if (availableTiyin < MIN_WITHDRAWAL_TIYIN) {
    return (
      <section className="space-y-2 rounded-2xl border border-border bg-card p-4" role="status">
        <h2 className="font-bold">Pul yechish uchun balans yetarli emas</h2>
        <p className="text-sm text-muted-foreground">Eng kam yechish summasi: {formatTiyin(MIN_WITHDRAWAL_TIYIN)} so‘m. Mavjud balans: {formatTiyin(availableTiyin)} so‘m.</p>
        <p className="text-xs text-muted-foreground">Muzlatilgan yoki yechish jarayonidagi mablag‘ni qayta yechib bo‘lmaydi.</p>
      </section>
    );
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        className="w-full min-h-11 rounded-xl border-border/80 font-semibold text-foreground transition hover:border-primary/40 hover:bg-primary/5 active:scale-95"
        onClick={() => setOpen(true)}
        disabled={availableTiyin <= 0}
      >
        <ArrowUpFromLine className="mr-2 h-4 w-4" aria-hidden="true" />
        Pul yechish
      </Button>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-6 transition-all">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <ArrowUpFromLine className="h-4.5 w-4.5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-foreground">Pul yechish so‘rovi</h2>
        </div>
      </div>

      <div className="space-y-3.5">
        <div>
          <Label htmlFor="wd-amount" className="text-xs font-semibold text-muted-foreground">Summa (so‘m)</Label>
          <div className="mt-1 flex gap-2">
            <Input
              id="wd-amount"
              inputMode="numeric"
              value={som}
              onChange={(e) => setSom(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="0"
              className="h-11 rounded-xl font-semibold tabular-nums border-border/80"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setSom(String(Math.floor(availableTiyin / 100)))}
              className="h-11 rounded-xl px-3 font-semibold text-xs border-border/80"
            >
              Hammasi
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Mavjud: {formatTiyin(availableTiyin)} so‘m
          </p>
        </div>

        <div>
          <Label htmlFor="wd-pan" className="text-xs font-semibold text-muted-foreground">Karta raqami</Label>
          <Input
            id="wd-pan"
            inputMode="numeric"
            autoComplete="cc-number"
            value={pan}
            onChange={(e) => setPan(formatPan(e.target.value))}
            placeholder="8600 0000 0000 0000"
            className="mt-1 h-11 rounded-xl font-mono font-medium border-border/80"
          />
        </div>

        <div>
          <Label htmlFor="wd-holder" className="text-xs font-semibold text-muted-foreground">Karta egasi</Label>
          <Input
            id="wd-holder"
            value={holderName}
            onChange={(e) => setHolderName(normalizeHolderName(e.target.value))}
            placeholder="ALI VALIYEV"
            className="mt-1 h-11 rounded-xl border-border/80 uppercase font-medium"
          />
        </div>

        <div>
          <Label htmlFor="wd-phone" className="text-xs font-semibold text-muted-foreground">Telefon raqam</Label>
          <Input
            id="wd-phone"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+998 90 123 45 67"
            className="mt-1 h-11 rounded-xl border-border/80 font-medium"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Admin siz bilan bog‘lanishi uchun
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs sm:text-sm font-semibold text-destructive">
          {error}
        </p>
      )}

      <p className="mt-3 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground leading-relaxed">
        So‘rov yuborilgach summa hamyoningizda muzlatiladi va admin kartangizga
        o‘tkazgach yechiladi. Rad etilsa to‘liq qaytariladi.
      </p>

      <div className="mt-4 flex gap-2">
        <Button type="button" className="flex-1 min-h-11 rounded-xl font-semibold active:scale-95" onClick={submit} disabled={submitting}>
          {submitting ? 'Yuborilmoqda…' : 'So‘rov yuborish'}
        </Button>
        <Button type="button" variant="outline" className="min-h-11 rounded-xl border-border/80 font-semibold" onClick={() => setOpen(false)} disabled={submitting}>
          Bekor
        </Button>
      </div>
    </section>
  );
}
