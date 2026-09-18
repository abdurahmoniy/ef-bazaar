'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, PackagePlus, Wallet2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { UserAccountResponse } from '@/lib/accounts-types';
import { cn } from '@/lib/utils';

/**
 * E'lon berishning birinchi qadami: tayyor akkountdan tanlash yoki
 * yangisini to'ldirish.
 *
 * <p>Akkounti yo'q odam bu qadamni umuman ko'rmaydi — bo'sh ro'yxatli
 * tanlov bir bosishlik ortiqcha yo'l bo'lardi.
 */
export function ListingSourceStep({
  accounts,
  onNew,
  onPick,
}: {
  accounts: UserAccountResponse[];
  onNew: () => void;
  onPick: (account: UserAccountResponse) => void;
}) {
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (accounts.length === 0) onNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length]);

  if (accounts.length === 0) return null;

  if (picking) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-black text-foreground">Qaysi akkountni sotasiz?</h2>
          <Button type="button" variant="ghost" size="sm" onClick={() => setPicking(false)}>
            Orqaga
          </Button>
        </div>

        <ul className="space-y-2">
          {accounts.map((account) => {
            const title = account.title?.trim() || 'Nomsiz akkount';
            return (
              <li key={account.id}>
                <button
                  type="button"
                  disabled={account.onMarket}
                  onClick={() => onPick(account)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition',
                    account.onMarket
                      ? 'cursor-not-allowed opacity-60'
                      : 'hover:border-primary/50 hover:bg-primary/5',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-foreground">{title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {account.onMarket
                        ? 'Allaqachon bozorda'
                        : `${account.mediaMessageIds.length} ta rasm`}
                    </span>
                  </span>
                  {!account.onMarket && <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-base font-black text-foreground">Nima sotmoqchisiz?</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="flex flex-col gap-2 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-left transition hover:border-primary hover:bg-primary/10"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Wallet2 className="h-5 w-5" />
          </span>
          <span className="text-sm font-black text-foreground">
            Akkountlarimdan tanlash
            <span className="ml-1.5 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">
              {accounts.length}
            </span>
          </span>
          <span className="text-xs text-muted-foreground">
            Ma&apos;lumotlari tayyor — faqat narxni qo&apos;yasiz.
          </span>
        </button>

        <button
          type="button"
          onClick={onNew}
          className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary/40 hover:bg-muted/40"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground">
            <PackagePlus className="h-5 w-5" />
          </span>
          <span className="text-sm font-black text-foreground">
            Yangi akkount ma&apos;lumotlarini kiritish
          </span>
          <span className="text-xs text-muted-foreground">
            To&apos;ldirganingiz &quot;Akkountlarim&quot;da ham saqlanadi.
          </span>
        </button>
      </div>
    </div>
  );
}
