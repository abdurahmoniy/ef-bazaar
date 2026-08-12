import Link from 'next/link';
import { Package2, Plus } from 'lucide-react';

import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import { AppliedFilterChips } from '@/components/marketplace/applied-filter-chips';
import { ListingFilters, QuickChips } from '@/components/marketplace/listing-filters';
import { ListingsPagination } from '@/components/marketplace/listings-pagination';
import { MarketplaceFilterSheet } from '@/components/marketplace/marketplace-filter-sheet';
import {
  MarketplaceResultsRegion,
  MarketplaceToolbar,
} from '@/components/marketplace/marketplace-toolbar';
import { PlayerFilterLauncher } from '@/components/marketplace/player-filter-launcher';
import {
  ResponsiveListingGrid,
  ResponsiveListingGridSkeleton,
} from '@/components/marketplace/responsive-listing-grid';
import { type SortMenuOption } from '@/components/marketplace/sort-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { type MarketplaceFilterId } from '@/lib/marketplace-format';
import {
  buildAppliedMarketplaceFilters,
  generalAppliedFilterCount,
} from '@/lib/marketplace-applied-filters';
import {
  loosenMarketplaceMatch,
  marketplaceHref,
  setMarketplacePage,
  setMarketplaceSort,
  type MarketplaceView,
} from '@/lib/marketplace-query';
import { LISTING_SORT_OPTIONS, paramToSortId } from '@/lib/marketplace-sort';
import type { FetchResult } from '@/lib/marketplace-server';
import type {
  ListingBrowseParams,
  ListingResponse,
  PageResponse,
} from '@/lib/marketplace-types';
import { parsePlayerMatchValues } from '@/lib/player-match-query';

interface MarketplaceBrowserProps {
  filters: ListingBrowseParams;
  activeFilter: MarketplaceFilterId;
  query?: string;
  result: FetchResult<PageResponse<ListingResponse>>;
  rawQuery: string;
  view: MarketplaceView;
  authenticated: boolean;
}

export function MarketplaceBrowser({
  filters,
  activeFilter,
  query,
  result,
  rawQuery,
  view,
  authenticated,
}: MarketplaceBrowserProps) {
  const page = result.ok ? result.data : null;

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
  const activeSortId = paramToSortId(filters.sort);
  const activeSortLabel = LISTING_SORT_OPTIONS.find((option) => option.id === activeSortId)?.label
    ?? LISTING_SORT_OPTIONS[0].label;
  const title = query ? `“${query}” bo‘yicha natijalar` : 'eFootball akkountlar';
  const filterProps = { filters, rawQuery: currentQuery };

  const filterTrigger = (
    <MarketplaceFilterSheet
      filters={filters}
      rawQuery={currentQuery}
      activeCount={generalFilterCount}
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
        <MarketplaceToolbar
          title={title}
          totalElements={page?.totalElements ?? 0}
          filterTrigger={filterTrigger}
          playerTrigger={playerTrigger}
          sortOptions={sortOptions}
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

        {!result.ok ? (
          <ApiErrorPanel title="E'lonlar yuklanmadi" error={result.error} />
        ) : page === null || page.content.length === 0 ? (
          <BrowseEmpty
            query={query}
            hasPlayerMatch={playerFilterCount > 0}
            currentQuery={currentQuery}
            activeMatchStrictness={activeMatch.strictness}
          />
        ) : (
          <>
            <ResponsiveListingGrid
              listings={page.content}
              view={view}
              rawQuery={currentQuery}
              matchCriteria={activeMatch.criteria}
            />
            <ListingsPagination
              page={page.page}
              totalPages={page.totalPages}
              buildHref={(nextPage) => marketplaceHref(setMarketplacePage(rawParams, nextPage))}
            />
          </>
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

function BrowseEmpty({
  query,
  hasPlayerMatch,
  currentQuery,
  activeMatchStrictness,
}: {
  query?: string;
  hasPlayerMatch: boolean;
  currentQuery: string;
  activeMatchStrictness: number;
}) {
  const loosen = loosenMarketplaceMatch(
    new URLSearchParams(currentQuery),
    activeMatchStrictness,
  );
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-4 py-16 text-center shadow-card">
      <Package2 className="mx-auto h-10 w-10 text-muted-foreground/50" />
      <h2 className="mt-3 text-base font-bold text-foreground">
        {hasPlayerMatch ? 'Bu tarkibga mos akkount topilmadi' : query ? 'Hech narsa topilmadi' : "Hozircha e'lonlar yo'q"}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {hasPlayerMatch
          ? 'Qat’iylikni pasaytiring yoki tanlangan o‘yinchilarni tahrirlang.'
          : query
          ? "Boshqa kalit so'z yoki filtrni sinab ko'ring."
          : "Birinchi bo'lib akkountingizni sotishga qo'ying."}
      </p>
      {hasPlayerMatch ? (
        <Button asChild className="mt-4">
          <Link href={marketplaceHref(loosen)}>Qat’iylikni pasaytirish</Link>
        </Button>
      ) : (
        <Button asChild className="mt-4">
          <Link href="/marketplace/new">
            <Plus className="h-4 w-4" /> Akkount joylash
          </Link>
        </Button>
      )}
    </div>
  );
}
