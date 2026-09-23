import Link from 'next/link';
import { ArrowUpRight, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatTiyin } from '@/lib/money';

export function ProfileBalance({ availableTiyin }: { availableTiyin: number | null }) {
  return (
    <section aria-label="Hamyon balansi" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/10 bg-primary/5 p-4">
      <div>
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Wallet aria-hidden className="h-4 w-4" />Mavjud balans
        </p>
        {availableTiyin === null ? (
          <p className="mt-1 text-sm text-muted-foreground">Balans yuklanmadi</p>
        ) : (
          <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
            {formatTiyin(availableTiyin)} <span className="text-sm font-medium text-muted-foreground">so‘m</span>
          </p>
        )}
      </div>
      <Button asChild variant="outline" className="min-h-11 rounded-full">
        <Link href="/hamyon">Hamyonni ochish<ArrowUpRight aria-hidden className="h-4 w-4" /></Link>
      </Button>
    </section>
  );
}
