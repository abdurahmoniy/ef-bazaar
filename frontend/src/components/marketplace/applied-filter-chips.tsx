import Link from 'next/link';
import { X } from 'lucide-react';

import type { AppliedMarketplaceFilter } from '@/lib/marketplace-applied-filters';
import { clearMarketplaceCriteria, marketplaceHref } from '@/lib/marketplace-query';

interface AppliedFilterChipsProps {
  items: readonly AppliedMarketplaceFilter[];
  rawQuery: string;
}

export function AppliedFilterChips({ items, rawQuery }: AppliedFilterChipsProps) {
  if (!items.length) return null;

  const clearHref = marketplaceHref(
    clearMarketplaceCriteria(new URLSearchParams(rawQuery)),
  );

  return (
    <nav aria-label="Qo‘llangan filtrlar" className="flex flex-wrap items-center gap-2">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className="tap-press inline-flex min-h-11 items-center gap-1.5 rounded-full border border-primary/25 bg-primary/5 px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary/50 hover:bg-primary/10"
        >
          <span>{item.label}</span>
          <X aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="sr-only">filtrini olib tashlash</span>
        </Link>
      ))}
      <Link
        href={clearHref}
        className="tap-press inline-flex min-h-11 items-center rounded-full px-3 py-2 text-xs font-bold text-primary underline-offset-4 transition hover:underline"
      >
        Barchasini tozalash
      </Link>
    </nav>
  );
}
