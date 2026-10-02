import Link from 'next/link';

import { cn } from '@/lib/utils';
import type { MarketplaceNotice, MarketplaceTab } from '@/lib/marketplace-page-loader';
import { marketplaceHref, setMarketplaceTab } from '@/lib/marketplace-query';

const TABS: { id: MarketplaceTab; label: string }[] = [
  { id: 'mine', label: 'Qiziqishlarim' },
  { id: 'market', label: 'Katta bozor' },
];

export const MARKETPLACE_NOTICE_TEXT: Record<MarketplaceNotice, string> = {
  feed_empty:
    "Hali siz uchun tanlov yo'q — e'lonlarga like bosing yoki Dream Team tuzing. Hozircha Katta bozor ko'rsatilmoqda.",
  rec_unavailable: "Shaxsiy tanlov hozir ishlamayapti — Katta bozor ko'rsatilmoqda.",
};

export function MarketplaceTabs({ active, rawQuery }: { active: MarketplaceTab; rawQuery: string }) {
  const params = new URLSearchParams(rawQuery);
  return (
    <nav aria-label="Bozor bo'limlari" className="flex gap-1 rounded-xl border border-border bg-card p-1">
      {TABS.map((tab) => {
        const selected = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={marketplaceHref(setMarketplaceTab(params, tab.id))}
            aria-current={selected ? 'page' : undefined}
            className={cn(
              // Telegram WebView shriftni kattalashtiradi: matn bir qatorda, markazda; sig'masa "…".
              'flex min-h-10 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-lg px-2 text-center text-[13px] font-semibold leading-none transition-colors sm:px-3 sm:text-sm',
              selected ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            <span className="truncate">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function MarketplaceNoticeBanner({ notice }: { notice: MarketplaceNotice }) {
  return (
    <p role="status" className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      {MARKETPLACE_NOTICE_TEXT[notice]}
    </p>
  );
}
