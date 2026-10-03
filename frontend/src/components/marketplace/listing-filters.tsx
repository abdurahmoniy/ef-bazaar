'use client';

import { Loader2, SlidersHorizontal } from 'lucide-react';
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
import { useMediaQuery } from '@/hooks/use-media-query';
import { useMarketplaceFilterPreview } from '@/hooks/use-marketplace-filter-preview';
import { formatCompactNumber } from '@/lib/marketplace-format';
import { playerAppliedFilterCount } from '@/lib/marketplace-applied-filters';

interface ListingFiltersProps {
  filters: ListingBrowseParams;
  rawQuery: string;
  authenticated?: boolean;
}
/** Desktop detailed-filter controller sharing the mobile draft and preview contract. */
export function ListingFilters({ filters, rawQuery, authenticated = false }: ListingFiltersProps) {
  const router = useRouter();
  const navigation = useMarketplaceNavigation();
  const [draft, setDraft] = React.useState(() => filterDraftFromBrowseParams(filters));
  const applyStartedRef = React.useRef(false);
  const errors = validateMarketplaceFilterDraft(draft);
  const valid = Object.keys(errors).length === 0;
  const desktop = useMediaQuery('(min-width: 1024px)');
  const preview = useMarketplaceFilterPreview(rawQuery, draft, valid && desktop, authenticated);

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
    <aside className="hidden self-start lg:sticky lg:top-32 lg:block">
      <form
        onSubmit={apply}
        className="flex max-h-[calc(100dvh-9rem)] flex-col overflow-hidden "
      >
        <div className="flex shrink-0 items-center gap-2 pb-4 text-sm font-bold text-foreground">
          <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden />
          Filtrlar
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-3">
          <ListingFilterFields
            draft={draft}
            errors={errors}
            onChange={setDraft}
            playerCount={playerAppliedFilterCount(new URLSearchParams(rawQuery))}
            onOpenPlayers={() => {
              if (!valid) return;
              const params = applyMarketplaceFilterDraft(new URLSearchParams(rawQuery), draft);
              router.push(`${marketplaceHref(params)}#marketplace-player-filter`);
              window.dispatchEvent(new CustomEvent('open-marketplace-player-filter', { detail: params.toString() }));
            }}
          />
        </div>
        <div className="shrink-0 space-y-2 border-t border-border bg-background py-4 pr-3">
          <p className="flex min-h-4 items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
            {preview.status === 'loading' && <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden />}
            {preview.status === 'success' ? `${formatCompactNumber(preview.count)} ta e‘lon` : preview.status === 'loading' ? 'Hisoblanmoqda' : preview.status === 'error' ? 'Natijalar sonini hisoblab bo‘lmadi. Filtrlarni qo‘llashingiz mumkin.' : ''}
          </p>
          <div className="grid grid-cols-2 gap-2">
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
