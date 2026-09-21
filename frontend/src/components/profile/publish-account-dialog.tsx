'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { AlertCircle, Loader2, Store, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { publishAccount } from '@/lib/accounts-client';
import type { UserAccountResponse } from '@/lib/accounts-types';
import { formatPriceUZS } from '@/lib/marketplace-format';

/** Backend ham shu chegarani qo'yadi — bu yerda faqat tezroq aytiladi. */
const MIN_PRICE = 5000;

const EXCHANGE_OPTIONS = [
  { value: '', label: "Obmen yo'q" },
  { value: 'EXCHANGE_ONLY', label: 'Faqat obmen' },
  { value: 'EXCHANGE_WITH_SURCHARGE', label: 'Obmen + doplata' },
  { value: 'BOTH', label: 'Obmen yoki obmen + doplata' },
] as const;

/**
 * Bozorga chiqarish oynasi.
 *
 * <p>Faqat SOTUV SHARTLARI so'raladi: qolgan hamma narsa akkountda tayyor.
 * Kanalga reklama bu yerda emas — e'lon yaratilgach uning o'z "Reklama"
 * tugmasi orqali, e'lonlar uchun allaqachon ishlab turgan yo'l bilan.
 */
export function PublishAccountDialog({
  account,
  onClose,
}: {
  account: UserAccountResponse;
  onClose: () => void;
}) {
  const router = useRouter();
  const [price, setPrice] = useState('');
  const [negotiable, setNegotiable] = useState(false);
  const [exchangeMode, setExchangeMode] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, onClose]);

  const priceNumber = Number(price.replace(/\s/g, ''));
  const priceValid = Number.isFinite(priceNumber) && priceNumber >= MIN_PRICE;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!priceValid) {
      setError(`Narx kamida ${formatPriceUZS(MIN_PRICE)} bo'lishi kerak`);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await publishAccount(account.id, {
        price: priceNumber,
        priceNegotiable: negotiable,
        exchangeMode: exchangeMode ? exchangeMode : null,
        channelIds: [],
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/marketplace/${result.data.id}`);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => !pending && onClose()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-account-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl border border-border bg-card p-5 shadow-2xl sm:rounded-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 id="publish-account-title" className="text-base font-black text-foreground">
              Bozorga chiqarish
            </h3>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {account.title?.trim() || 'Nomsiz akkount'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Yopish"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="publish-price">Narx (so&apos;m)</Label>
            <Input
              id="publish-price"
              inputMode="numeric"
              autoFocus
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d\s]/g, ''))}
              placeholder="2 400 000"
              disabled={pending}
            />
            {priceValid && (
              <p className="text-[11px] font-semibold text-primary">{formatPriceUZS(priceNumber)}</p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={negotiable}
              onChange={(e) => setNegotiable(e.target.checked)}
              disabled={pending}
            />
            Savdolashish mumkin
          </label>

          <div className="space-y-1.5">
            <Label htmlFor="publish-exchange">Obmen sharti</Label>
            <Select
              id="publish-exchange"
              value={exchangeMode}
              onChange={(e) => setExchangeMode(e.target.value)}
              disabled={pending}
            >
              {EXCHANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Shart e&apos;longa tegishli — keyingi safar boshqacha qo&apos;yishingiz mumkin.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={pending}>
              Bekor qilish
            </Button>
            <Button type="submit" className="flex-1" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
              Bozorga chiqarish
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
