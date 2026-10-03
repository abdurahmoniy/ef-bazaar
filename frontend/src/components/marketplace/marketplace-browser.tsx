import { AppliedFilterChips } from '@/components/marketplace/applied-filter-chips';
import { ListingFilters, QuickChips } from '@/components/marketplace/listing-filters';
import { MarketplaceListingFeed } from '@/components/marketplace/marketplace-listing-feed';
import { MarketplaceFilterSheet } from '@/components/marketplace/marketplace-filter-sheet';
import {
  MarketplaceResultsRegion,
  MarketplaceToolbar,
} from '@/components/marketplace/marketplace-toolbar';
import { PlayerFilterLauncher } from '@/components/marketplace/player-filter-launcher';
import { MarketplaceNoticeBanner } from '@/components/marketplace/marketplace-notice';
import {
  MarketplaceEmptyState,
  MarketplaceErrorState,
  getMarketplaceEmptyState,
} from '@/components/marketplace/marketplace-result-state';
import {
  ResponsiveListingGridSkeleton,
} from '@/components/marketplace/responsive-listing-grid';
import { type SortMenuOption } from '@/components/marketplace/sort-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { type MarketplaceFilterId } from '@/lib/marketplace-format';
import {
  buildAppliedMarketplaceFilters,
  generalAppliedFilterCount,
} from '@/lib/marketplace-applied-filters';
import {
  marketplaceHref,
  setMarketplaceSort,
  setMarketplaceTab,
  type MarketplaceView,
} from '@/lib/marketplace-query';
import { LISTING_SORT_OPTIONS, paramToSortId } from '@/lib/marketplace-sort';
import type { MarketplaceTab } from '@/lib/marketplace-page-loader';
import type { MarketplacePageLoad } from '@/lib/marketplace-page-server';
import type { ListingBrowseParams } from '@/lib/marketplace-types';
import { parsePlayerMatchValues } from '@/lib/player-match-query';

interface MarketplaceBrowserProps {
  filters: ListingBrowseParams;
  activeFilter: MarketplaceFilterId;
  query?: string;
  load: MarketplacePageLoad;
  tab: MarketplaceTab;
  rawQuery: string;
  view: MarketplaceView;
  authenticated: boolean;
}

export function MarketplaceBrowser({
  filters,
  activeFilter,
  query,
  load,
  tab,
  rawQuery,
  view,
  authenticated,
}: MarketplaceBrowserProps) {
  const page = load.ok ? load.data.page : null;
  const mode = load.ok ? load.data.mode : load.mode;
  const notice = load.ok ? load.data.notice : undefined;
  const profileHash = load.ok ? load.data.profileHash : undefined;

  const activeMatch = parsePlayerMatchValues(
    filters.matchCards,
    String(filters.matchStrictness ?? 4),
  );
  // The dialog rewrites this raw query string in place, so every unrelated
  // parameter — including repeated criteria — survives applying a squad.
  const currentQuery = rawQuery;
  const rawParams = new URLSearchParams(rawQuery);
  const appliedFilters = buildAppliedMarketplaceFilters(rawParams);
  const generalFilterCount = generalAppliedFilterCount(appliedFilters);
  const playerFilterCount = activeMatch.criteria.length;

  // Precomputed here rather than in SortMenu: the client component needs real
  // hrefs, and every ordering must preserve raw public query state.
  const sortOptions: SortMenuOption[] = LISTING_SORT_OPTIONS.map((option) => ({
    id: option.id,
    label: option.label,
    href: marketplaceHref(setMarketplaceSort(rawParams, option.param)),
  }));
  if (authenticated) {
    sortOptions.unshift({
      id: 'mine',
      label: 'Qiziqishlarim',
      href: marketplaceHref(setMarketplaceTab(rawParams, 'mine')),
    });
  }
  const activeSortId = authenticated && tab === 'mine' ? 'mine' : paramToSortId(filters.sort);
  const activeSortLabel = sortOptions.find((option) => option.id === activeSortId)!.label;
  const title = query ? `“${query}” bo‘yicha natijalar` : 'eFootball akkountlar';
  const filterProps = { filters, rawQuery: currentQuery, authenticated };

  const filterTrigger = (
    <MarketplaceFilterSheet
      filters={filters}
      rawQuery={currentQuery}
      activeCount={generalFilterCount}
      authenticated={authenticated}
    />
  );
  const playerTrigger = (
    <PlayerFilterLauncher
      currentQuery={currentQuery}
      activeMatchCards={playerFilterCount > 0 ? filters.matchCards : []}
      activeMinMatch={activeMatch.strictness}
      authenticated={authenticated}
    />
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-6">
      <ListingFilters {...filterProps} />

      <MarketplaceResultsRegion>
        {notice && <MarketplaceNoticeBanner notice={notice} />}
        <MarketplaceToolbar
          title={title}
          totalElements={page?.totalElements ?? 0}
          filterTrigger={filterTrigger}
          playerTrigger={playerTrigger}
          sortOptions={mode === 'match' ? [] : sortOptions}
          activeSortId={activeSortId}
          activeSortLabel={activeSortLabel}
          rawQuery={currentQuery}
          view={view}
          quickChips={(
            <QuickChips
              activeFilter={activeFilter}
              currentQuery={currentQuery}
            />
          )}
        />

        <AppliedFilterChips items={appliedFilters} rawQuery={currentQuery} />

        {!load.ok ? (
          <MarketplaceErrorState retryHref={marketplaceHref(rawParams)} />
        ) : page === null || page.content.length === 0 ? (
          <MarketplaceEmptyState state={getMarketplaceEmptyState(rawParams)} />
        ) : (
          <MarketplaceListingFeed
            initialPage={page}
            filters={filters}
            view={view}
            rawQuery={currentQuery}
            matchCriteria={activeMatch.criteria}
            tab={tab}
            authenticated={authenticated}
            mode={mode}
            profileHash={profileHash}
          />
        )}
      </MarketplaceResultsRegion>
    </div>
  );
}

export function MarketplaceBrowserSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-6">
      <Skeleton className="hidden h-96 rounded-xl lg:block" />
      <div className="space-y-3">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <ResponsiveListingGridSkeleton />
      </div>
    </div>
  );
}
