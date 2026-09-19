'use client';

import { SlidersHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { ListingFilterFields } from '@/components/marketplace/listing-filter-fields';
import {
  MarketplacePendingLink,
  useMarketplaceNavigation,
} from '@/components/marketplace/marketplace-navigation';
import { Button } from '@/components/ui/button';
import {
  MARKETPLACE_FILTERS,
  type MarketplaceFilterId,
} from '@/lib/marketplace-format';
import {
  applyMarketplaceFilterDraft,
  clearMarketplaceFilterDraft,
  filterDraftFromBrowseParams,
  validateMarketplaceFilterDraft,
} from '@/lib/marketplace-filter-draft';
import { marketplaceHref, setMarketplaceQuickFilter } from '@/lib/marketplace-query';
import { getTelegramWebApp } from '@/lib/telegram';
import { telegramHaptic } from '@/lib/telegram-shell';
import type { ListingBrowseParams } from '@/lib/marketplace-types';
import { cn } from '@/lib/utils';

interface ListingFiltersProps {
  filters: ListingBrowseParams;
  rawQuery: string;
}
/** Desktop detailed-filter controller. It shares the mobile draft contract but
 * intentionally performs no preview request. Clear remains local until Apply. */
export function ListingFilters({ filters, rawQuery }: ListingFiltersProps) {
  const router = useRouter();
  const navigation = useMarketplaceNavigation();
  const [draft, setDraft] = React.useState(() => filterDraftFromBrowseParams(filters));
  const applyStartedRef = React.useRef(false);
  const errors = validateMarketplaceFilterDraft(draft);
  const valid = Object.keys(errors).length === 0;

  React.useEffect(() => {
    setDraft(filterDraftFromBrowseParams(filters));
    applyStartedRef.current = false;
  }, [filters, rawQuery]);

  function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || applyStartedRef.current) return;
    applyStartedRef.current = true;
    const href = marketplaceHref(
      applyMarketplaceFilterDraft(new URLSearchParams(rawQuery), draft),
    );
    if (navigation) navigation.navigate(href);
    else router.push(href);
  }

  return (
    <aside className="hidden space-y-3 lg:sticky lg:top-32 lg:block">
      <form
        onSubmit={apply}
        className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-card"
      >
        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
          <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden />
          Filtrlar
        </div>
        <ListingFilterFields
          draft={draft}
          errors={errors}
          onChange={setDraft}
        />
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button type="submit" className="min-h-11" disabled={!valid}>
            Qo‘llash
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setDraft(clearMarketplaceFilterDraft())}
          >
            Tozalash
          </Button>
        </div>
      </form>
    </aside>
  );
}

export function QuickChips({
  activeFilter,
  currentQuery,
}: {
  activeFilter: MarketplaceFilterId;
  currentQuery?: string;
}) {
  return (
    <>
      {MARKETPLACE_FILTERS.map((filter) => (
        <MarketplacePendingLink
          key={filter.id}
          href={marketplaceHref(setMarketplaceQuickFilter(
            new URLSearchParams(currentQuery),
            filter.id,
          ))}
          aria-current={filter.id === activeFilter ? 'page' : undefined}
          onClick={(event) => {
            if (filter.id === activeFilter) return;
            const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
            if (event.defaultPrevented || modified || event.button !== 0) return;
            let reducedMotion = false;
            try {
              reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            } catch {}
            const webApp = getTelegramWebApp();
            if (!webApp?.initData.trim()) return;
            telegramHaptic(webApp, 'selection', reducedMotion);
          }}
          className={cn(
            'tap-press inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 py-1 text-xs font-semibold transition',
            filter.id === activeFilter
              ? 'border-primary bg-primary text-primary-foreground shadow-sm'
              : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
          )}
        >
          {filter.label}
        </MarketplacePendingLink>
      ))}
    </>
  );
}
