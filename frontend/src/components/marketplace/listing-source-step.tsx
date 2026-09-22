'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { ArrowRight, ArrowUpRight, CheckCircle2, ChevronRight, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SellingAccountSummary } from '@/components/marketplace/selling-account-summary';
import type { UserAccountResponse } from '@/lib/accounts-types';

/** Show the accounts themselves so returning sellers can go straight to pricing. */
export function ListingSourceStep({ accounts, onNew, onPick }: {
  accounts: UserAccountResponse[];
  onNew: () => void;
  onPick: (account: UserAccountResponse) => void;
}) {
  const activeAccounts = accounts.filter((account) => account.status === 'ACTIVE');
  const available = activeAccounts.filter((account) => !account.onMarket);
  const listed = activeAccounts.filter((account) => account.onMarket);

  useEffect(() => {
    if (activeAccounts.length === 0) onNew();
  }, [activeAccounts.length, onNew]);

  if (activeAccounts.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="mb-3 flex items-center gap-2.5">
        <h2 className="text-sm font-bold text-foreground">Akkountlarim</h2>
        <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {available.length} ta mavjud
        </span>
      </div>
      <ul className="space-y-3">
        {available.map((account) => (
          <li key={account.id} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <SellingAccountSummary account={account} />
            <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                Ma’lumotlar saqlangan
              </span>
              <Button type="button" className="min-h-12 sm:min-h-11" onClick={() => onPick(account)} aria-label={`${account.title?.trim() || 'Nomsiz akkount'}: Narx belgilash`}>
                Narx belgilash <ArrowRight aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onNew} className="flex w-full items-center gap-3 rounded-2xl border border-border p-4 text-left transition-colors hover:border-primary/50 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-4 sm:p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card"><Plus className="h-5 w-5" aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-foreground">Yangi akkount qo‘shish</span>
          <span className="mt-1 block text-xs text-muted-foreground">Rasmlar va ma’lumotlarni kiriting</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      {listed.length > 0 && (
        <div className="pt-5">
          <h2 className="mb-3 text-sm font-bold text-muted-foreground">Bozordagi akkountlar</h2>
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {listed.map((account) => (
              <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{account.title?.trim() || 'Nomsiz akkount'}</p><p className="mt-1 text-xs text-muted-foreground">Bozorda</p></div>
                {account.currentListingId && <Button asChild variant="outline" size="sm" className="min-h-11"><Link href={`/marketplace/${account.currentListingId}`}>E’lonni ko‘rish <ArrowUpRight aria-hidden /></Link></Button>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
