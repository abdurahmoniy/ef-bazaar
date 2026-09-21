'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Package2, Plus } from 'lucide-react';

import { AccountCard } from '@/components/profile/account-card';
import { PublishAccountDialog } from '@/components/profile/publish-account-dialog';
import { Button } from '@/components/ui/button';
import type { UserAccountResponse } from '@/lib/accounts-types';

/**
 * "Akkountlarim" tabi.
 *
 * <p>Bozorga chiqarish oynasi shu yerda yashaydi, kartochkada emas:
 * bir vaqtda bitta oyna ochilishi kerak va uni ro'yxat egallaydi.
 */
export function ProfileAccounts({ accounts }: { accounts: UserAccountResponse[] }) {
  const [publishing, setPublishing] = useState<UserAccountResponse | null>(null);

  if (accounts.length === 0) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-card px-4 py-16 text-center shadow-xs">
        <div className="grid h-16 w-16 place-items-center rounded-3xl bg-muted/50 text-muted-foreground ring-1 ring-border/50">
          <Package2 className="h-8 w-8 opacity-60" />
        </div>
        <h2 className="mt-3 text-base font-bold text-foreground">Sizda hali akkount yo&apos;q</h2>
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
          Akkountingizni bir marta to&apos;ldiring — keyin uni istagan vaqtingizda bozorga
          chiqarasiz va qaytarib olasiz.
        </p>
        <Button asChild size="sm" className="mt-4 rounded-full px-5 font-semibold shadow-xs">
          <Link href="/profile/accounts/new">
            <Plus className="h-4 w-4" /> Akkount qo&apos;shish
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => (
          <AccountCard key={account.id} account={account} onPublish={setPublishing} />
        ))}
      </div>

      {publishing && (
        <PublishAccountDialog account={publishing} onClose={() => setPublishing(null)} />
      )}
    </>
  );
}
