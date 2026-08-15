'use client';

import type { ReactNode } from 'react';

import { useMarketplaceNavigation } from '@/components/marketplace/marketplace-navigation';
import { MarketplaceViewMenu } from '@/components/marketplace/marketplace-view-menu';
import { SortMenu, type SortMenuOption } from '@/components/marketplace/sort-menu';
import { formatCompactNumber } from '@/lib/marketplace-format';
import type { MarketplaceView } from '@/lib/marketplace-query';

interface MarketplaceToolbarProps {
  title: string;
  totalElements: number;
  filterTrigger: ReactNode;
  playerTrigger: ReactNode;
  sortOptions: SortMenuOption[];
  activeSortId: string;
  activeSortLabel: string;
  rawQuery: string;
  view: MarketplaceView;
  quickChips: ReactNode;
}

export function MarketplaceToolbar({
  title,
  totalElements,
  filterTrigger,
  playerTrigger,
  sortOptions,
  activeSortId,
  activeSortLabel: _activeSortLabel,
  rawQuery,
  view,
  quickChips,
}: MarketplaceToolbarProps) {
  return (
    <div className="space-y-2">
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <h1
          id="marketplace-results-heading"
          tabIndex={-1}
          className="truncate text-base font-black leading-tight text-foreground outline-none sm:text-lg"
        >
          {title}
        </h1>
        <p className="shrink-0 text-xs font-bold text-muted-foreground" aria-live="polite">
          {formatCompactNumber(totalElements)} ta e‘lon
        </p>
      </div>

      <div className="hidden min-w-0 [&>button]:min-h-11 [&>button]:w-full [&>button]:min-w-0 [&>button]:px-1.5 [&>button]:text-xs [&>button>svg]:hidden min-[400px]:[&>button>svg]:block">
        {filterTrigger}
      </div>

      <div className="marketplace-toolbar-actions snap-rail flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:gap-2">
        {playerTrigger}
        {quickChips}
        <div className="hidden sm:block">
          <SortMenu options={sortOptions} activeId={activeSortId} compact />
        </div>
        <div className="hidden sm:block">
          <MarketplaceViewMenu rawQuery={rawQuery} view={view} />
        </div>
      </div>
    </div>
  );
}

export function MarketplaceResultsRegion({ children }: { children: ReactNode }) {
  const navigation = useMarketplaceNavigation();
  return (
    <section
      className="min-w-0 space-y-3"
      aria-labelledby="marketplace-results-heading"
      aria-busy={navigation?.pending || undefined}
    >
      {children}
    </section>
  );
}
