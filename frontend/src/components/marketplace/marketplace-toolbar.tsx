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
  activeSortLabel,
  rawQuery,
  view,
  quickChips,
}: MarketplaceToolbarProps) {
  return (
    <div className="space-y-2">
      <h1
        id="marketplace-results-heading"
        tabIndex={-1}
        className="text-base font-black leading-tight text-foreground outline-none sm:text-xl"
      >
        {title}
      </h1>

      <div className="marketplace-toolbar-actions">
        <div className="min-w-0 lg:hidden [&>button]:min-h-11 [&>button]:w-full [&>button]:min-w-0 [&>button]:px-1.5 [&>button]:text-xs [&>button>svg]:hidden min-[400px]:[&>button>svg]:block">
          {filterTrigger}
        </div>
        <div className="min-w-0 [&>button]:w-full [&>button]:min-h-11 [&>button]:min-w-0 [&>button]:justify-center [&>button]:px-1.5 [&>button]:text-xs [&>button>svg]:hidden min-[400px]:[&>button>svg]:block">
          {playerTrigger}
        </div>
        <SortMenu options={sortOptions} activeId={activeSortId} compact />
        <MarketplaceViewMenu rawQuery={rawQuery} view={view} />
      </div>

      <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
        <p className="font-semibold text-muted-foreground" aria-live="polite">
          {formatCompactNumber(totalElements)} ta e‘lon
        </p>
        <p className="truncate font-semibold text-muted-foreground">{activeSortLabel}</p>
      </div>

      {quickChips}
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
