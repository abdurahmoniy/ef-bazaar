'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Check, Loader2, Mail, Sparkles } from 'lucide-react';

import { VerifiedEmailMark } from '@/components/profile/verified-email-mark';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { setAccountEmail } from '@/lib/accounts-client';
import type { UserAccountResponse } from '@/lib/accounts-types';

/**
 * Akkountga biriktirilgan pochta.
 *
 * <p>Asosiy og'riq shu: savdodan keyin qo'lda bir nechta
 * {@code …@efbazaar.uz} qoladi va qaysi biri qaysi akkountniki ekani
 * yodda qolmaydi. Bu yerda u akkountning yonida turadi.
 *
 * <p>Manzil maxfiy — e'longa hech qachon chiqmaydi.
 */
export function AccountEmailField({ account }: { account: UserAccountResponse }) {
  const router = useRouter();
  const [email, setEmail] = useState(account.email ?? '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = (account.email ?? '') !== email.trim();

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await setAccountEmail(account.id, email);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <section className="space-y-2 rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-muted-foreground" />
        <Label htmlFor="account-email" className="text-sm font-bold">
          Biriktirilgan email <span className="font-medium text-muted-foreground">(ixtiyoriy)</span>
        </Label>
        {account.emailVerified && account.email && !dirty && <VerifiedEmailMark />}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="account-email"
          type="email"
          inputMode="email"
          autoComplete="off"
          value={email}
          placeholder="akkount@efbazaar.uz"
          onChange={(e) => {
            setEmail(e.target.value);
            setSaved(false);
          }}
          disabled={pending}
          className="flex-1"
        />
        <Button type="button" onClick={save} disabled={pending || !dirty} className="sm:w-auto">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
          {saved && !dirty ? 'Saqlandi' : 'Saqlash'}
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      {!(account.emailSource === 'CUSTOM' && account.emailVerified) && (
        <Link
          href={`/mailboxes/custom?accountId=${encodeURIComponent(account.id)}`}
          className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-gold-foreground hover:underline"
        >
          <Sparkles aria-hidden className="h-3.5 w-3.5" />
          O‘zingiz istagan nom bilan email oling
        </Link>
      )}
      <p className="text-[11px] text-muted-foreground">
        Faqat sizga ko&apos;rinadi. E&apos;londa hech qachon ko&apos;rsatilmaydi. Bo&apos;sh
        qoldirsangiz biriktirilgan email uziladi. Qo&apos;lda o&apos;zgartirilgan email tasdiqlanmagan hisoblanadi.
      </p>
    </section>
  );
}
