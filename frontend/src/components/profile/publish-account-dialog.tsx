'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useId, useState, useTransition } from 'react';
import { AlertCircle, Loader2, Store, X } from 'lucide-react';

import { SellingAccountSummary } from '@/components/marketplace/selling-account-summary';
import { cn } from '@/lib/utils';

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
  layout = 'dialog',
}: {
  account: UserAccountResponse;
  onClose: () => void;
  layout?: 'dialog' | 'page';
}) {
  const inline = layout === 'page';
  const formId = useId();
  const priceId = `${formId}-price`;
  const priceHintId = `${formId}-price-hint`;
  const exchangeId = `${formId}-exchange`;
  const titleId = `${formId}-title`;
  const router = useRouter();
  const [price, setPrice] = useState('');
  const [negotiable, setNegotiable] = useState(false);
  const [exchangeMode, setExchangeMode] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (inline) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, onClose, inline]);

  const priceNumber = Number(price.replace(/\s/g, ''));
  const priceValid = Number.isFinite(priceNumber) && priceNumber >= MIN_PRICE;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (account.mediaMessageIds.length === 0) {
      setError('Kamida 1 ta rasm yuklang.');
      return;
    }
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
      className={inline ? undefined : "fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"}
      onClick={inline ? undefined : () => !pending && onClose()}
      role={inline ? undefined : 'presentation'}
    >
      <div
        role={inline ? undefined : 'dialog'}
        aria-modal={inline ? undefined : true}
        aria-labelledby={inline ? undefined : titleId}
        onClick={(e) => e.stopPropagation()}
        className={cn("w-full border border-border bg-card", inline ? "rounded-2xl p-4 sm:p-6" : "max-w-md rounded-t-2xl p-5 shadow-2xl sm:rounded-2xl")}
      >
        {inline ? (
          <div className="mb-6 border-b border-border pb-5"><SellingAccountSummary account={account} /></div>
        ) : <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 id={titleId} className="text-base font-black text-foreground">
              Sotuvga qo&apos;yish
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
        </div>}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor={priceId}>Narx (so&apos;m)</Label>
            <Input
              id={priceId}
              inputMode="numeric"
              autoFocus={!inline}
              aria-describedby={priceHintId}
              aria-invalid={!!error && !priceValid}
              className={inline ? "h-12 text-lg font-semibold sm:text-lg" : undefined}
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d\s]/g, ''))}
              placeholder="2 400 000"
              disabled={pending}
            />
            <p id={priceHintId} className="text-xs text-muted-foreground">Eng kam narx — {formatPriceUZS(MIN_PRICE)}</p>
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
            <Label htmlFor={exchangeId}>Obmen sharti</Label>
            <Select
              id={exchangeId}
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
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}{account.mediaMessageIds.length === 0 && (
                <Link href={`/profile/accounts/${encodeURIComponent(account.id)}`} className="mt-1 block font-semibold underline">Rasm qo‘shish</Link>
              )}</span>
            </div>
          )}

          <div className={cn("flex gap-2", inline && "flex-col-reverse pt-2 sm:flex-row sm:justify-end")}>
            <Button type="button" variant="outline" className={inline ? "min-h-12 sm:flex-none" : "flex-1"} onClick={onClose} disabled={pending}>
              {inline ? 'Orqaga' : 'Bekor qilish'}
            </Button>
            <Button type="submit" className={inline ? "min-h-12 sm:flex-none" : "flex-1"} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
              Sotuvga qo&apos;yish
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
