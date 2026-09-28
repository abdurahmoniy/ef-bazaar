'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getMyAccounts } from '@/lib/accounts-client';
import type { UserAccountResponse } from '@/lib/accounts-types';
import { listingMediaUrl } from '@/lib/marketplace-media';
import { accountTitle, fetchBusyAccountIds } from '@/lib/swap-accounts';
import { cn } from '@/lib/utils';

export const SWAP_OTHER = 'OTHER';

/**
 * Obmenda xaridor beradigan akkount.
 *
 * <p>Hech narsa oldindan tanlanmaydi: "Boshqa" ham ongli tanlov bo'lishi
 * kerak, aks holda odam o'ylamasdan platformadan tashqari akkount bilan
 * savdo ochib yuborardi. Ro'yxat balandligi cheklangan — Mini App'da
 * oyna cho'zilib ketmasligi uchun.
 */
export function SwapAccountPicker({ value, onChange }: { value: string | null; onChange: (value: string) => void }) {
  const [accounts, setAccounts] = useState<UserAccountResponse[] | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    void (async () => {
      const [result, busyIds] = await Promise.all([getMyAccounts(), fetchBusyAccountIds()]);
      if (!active) return;
      const list = result.ok ? result.data.filter(a => a.status === 'ACTIVE') : [];
      setAccounts(list);
      setBusy(busyIds);
      if (list.length === 0) onChange(SWAP_OTHER);
    })();
    return () => { active = false; };
    // onChange is a state setter from the parent; the list loads once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (accounts === null) return <p className="text-xs text-muted-foreground">Akkountlar yuklanmoqda…</p>;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-bold">Qaysi akkountingizni berasiz?</p>
      <div role="radiogroup" aria-label="Beriladigan akkount" className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
        {accounts.map(account => {
          const isBusy = busy.has(account.id);
          const cover = account.mediaMessageIds[0] ? listingMediaUrl(account.mediaMessageIds[0]) : null;
          const checked = value === account.id;
          return (
            <button key={account.id} type="button" role="radio" aria-checked={checked} disabled={isBusy}
              onClick={() => onChange(account.id)}
              className={cn('flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition',
                checked ? 'bg-primary/10 ring-1 ring-primary' : 'hover:bg-muted/60', isBusy && 'opacity-50')}>
              {cover
                ? <img src={cover} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
                : <span className="h-10 w-10 shrink-0 rounded-md bg-muted" aria-hidden="true" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{accountTitle(account)}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {isBusy ? 'Savdoda' : account.description?.split('\n')[0]?.trim() || '—'}
                </span>
              </span>
            </button>
          );
        })}
        <button type="button" role="radio" aria-checked={value === SWAP_OTHER} onClick={() => onChange(SWAP_OTHER)}
          className={cn('flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition',
            value === SWAP_OTHER ? 'bg-primary/10 ring-1 ring-primary' : 'hover:bg-muted/60')}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-dashed border-border text-muted-foreground" aria-hidden="true">?</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Boshqa</span>
            <span className="block truncate text-[11px] text-muted-foreground">Akkount platformaga kiritilmagan</span>
          </span>
        </button>
      </div>
      {accounts.length === 0 && (
        <Link href="/profile/accounts/new" className="inline-flex min-h-11 items-center text-xs font-medium text-primary underline-offset-2 hover:underline">
          Profilga akkount qo‘shish
        </Link>
      )}
    </div>
  );
}
