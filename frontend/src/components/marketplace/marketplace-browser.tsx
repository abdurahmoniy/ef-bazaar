import Link from 'next/link';
import { LayoutGrid, List, Package2, Plus } from 'lucide-react';

import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import { ListingCard } from '@/components/marketplace/listing-card';
import {
  ListingFilters,
  ListingFiltersForm,
  QuickChips,
} from '@/components/marketplace/listing-filters';
import { ListingsPagination } from '@/components/marketplace/listings-pagination';
import { MobileFilterSheet } from '@/components/marketplace/mobile-filter-sheet';
import { SortMenu, type SortMenuOption } from '@/components/marketplace/sort-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  buildListingSearchParams,
  formatCompactNumber,
  DEFAULT_PLATFORM,
  type MarketplaceFilterId,
} from '@/lib/marketplace-format';
import { LISTING_SORT_OPTIONS, paramToSortId } from '@/lib/marketplace-sort';
import type { FetchResult } from '@/lib/marketplace-server';
import type {
  ListingBrowseParams,
  ListingResponse,
  PageResponse,
} from '@/lib/marketplace-types';
import { cn } from '@/lib/utils';

interface MarketplaceBrowserProps {
  filters: ListingBrowseParams;
  activeFilter: MarketplaceFilterId;
  query?: string;
  result: FetchResult<PageResponse<ListingResponse>>;
  view?: 'grid' | 'list';
}

export function MarketplaceBrowser({
  filters,
  activeFilter,
  query,
  result,
  view = 'grid',
}: MarketplaceBrowserProps) {
  const divisionAttr = filters.attributes?.highest_division_level;
  const divisionValue = typeof divisionAttr === 'string' ? Number(divisionAttr) : undefined;
  const valuablePlayerIdRaw = filters.attributes?.valuable_players_id;
  const valuablePlayerId = typeof valuablePlayerIdRaw === 'string'
    ? Number.parseInt(valuablePlayerIdRaw, 10)
    : undefined;
  const valuablePlayerNameRaw = filters.attributes?.valuable_players_name;
  const valuablePlayerName = typeof valuablePlayerNameRaw === 'string'
    ? valuablePlayerNameRaw
    : undefined;
  const page = result.ok ? result.data : null;

  const filterProps = {
    activeFilter,
    query,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    priceNegotiable: filters.priceNegotiable,
    division: Number.isFinite(divisionValue) ? divisionValue : undefined,
    valuablePlayerId: Number.isFinite(valuablePlayerId) ? valuablePlayerId : undefined,
    valuablePlayerName,
    sortParam: filters.sort,
    attributes: filters.attributes,
  };

  const attrs = filters.attributes ?? {};
  const activeFilterCount = [
    filters.minPrice !== undefined || filters.maxPrice !== undefined,
    filters.priceNegotiable === true,
    filterProps.division !== undefined,
    Boolean(attrs['team_strength.min'] || attrs['team_strength.max']),
    Boolean(attrs['android_coins.min']),
    Boolean(attrs['ios_coins.min']),
    Boolean(attrs.exchange_mode),
    Boolean(attrs.has_google_play_link),
    Boolean(attrs.has_game_center_link),
    filterProps.valuablePlayerId !== undefined,
    Boolean(attrs.platform) && attrs.platform !== DEFAULT_PLATFORM,
  ].filter(Boolean).length;

  // Precomputed here rather than in SortMenu: the client component can't be
  // handed browseHref, and every ordering has to keep the active filters.
  const sortOptions: SortMenuOption[] = LISTING_SORT_OPTIONS.map((option) => ({
    id: option.id,
    label: option.label,
    href: browseHref({ ...filters, sort: option.param }, activeFilter, query, view, 0),
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-6">
      <ListingFilters {...filterProps} />

      <section className="min-w-0 space-y-3">
        <BrowseHeader
          activeFilter={activeFilter}
          query={query}
          view={view}
          totalElements={page?.totalElements ?? 0}
          sortOptions={sortOptions}
          activeSortId={paramToSortId(filters.sort)}
        />

        <div className="flex items-center gap-2">
          <div className="shrink-0 lg:hidden">
            <MobileFilterSheet activeCount={activeFilterCount}>
              <ListingFiltersForm {...filterProps} />
            </MobileFilterSheet>
          </div>
          <div className="min-w-0 flex-1">
            <QuickChips activeFilter={activeFilter} query={query} view={view} />
          </div>
        </div>

        {!result.ok ? (
          <ApiErrorPanel title="E'lonlar yuklanmadi" error={result.error} />
        ) : page === null || page.content.length === 0 ? (
          <BrowseEmpty query={query} />
        ) : (
          <>
            <div
              className={cn(
                view === 'list'
                  ? 'flex flex-col gap-2'
                  // Two columns on phones — one card per row wastes half the
                  // screen and doubles the scroll to the same listing.
                  : 'grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-3',
              )}
            >
              {page.content.map((listing) => (
                <ListingCard key={listing.id} listing={listing} variant={view} />
              ))}
            </div>
            <ListingsPagination
              page={page.page}
              totalPages={page.totalPages}
              buildHref={(nextPage) => browseHref(filters, activeFilter, query, view, nextPage)}
            />
          </>
        )}
      </section>
    </div>
  );
}

export function MarketplaceBrowserSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-6">
      <Skeleton className="hidden h-96 rounded-xl lg:block" />
      <div className="space-y-3">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-60 rounded-xl sm:h-72" />
          ))}
        </div>
      </div>
    </div>
  );
}

function BrowseHeader({
  activeFilter,
  query,
  view,
  totalElements,
  sortOptions,
  activeSortId,
}: {
  activeFilter: MarketplaceFilterId;
  query?: string;
  view: 'grid' | 'list';
  totalElements: number;
  sortOptions: SortMenuOption[];
  activeSortId: string;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        {/* Eyebrow is redundant on a phone — the tab bar already says where you are. */}
        <p className="hidden text-xs font-bold uppercase tracking-wide text-primary sm:block">
          Marketplace
        </p>
        <h1 className="line-clamp-2 text-lg font-black leading-tight text-foreground sm:mt-1 sm:text-2xl">
          {query ? `"${query}" bo'yicha natijalar` : 'eFootball akkountlar'}
        </h1>
        <p className="mt-0.5 text-xs font-semibold text-muted-foreground sm:mt-1">
          {formatCompactNumber(totalElements)} ta e'lon
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <SortMenu options={sortOptions} activeId={activeSortId} />

        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-card">
        <Link
          href={viewHref('grid', activeFilter, query)}
          className={cn(
            'tap-press grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition sm:h-10 sm:w-10',
            view === 'grid' && 'bg-accent text-accent-foreground',
          )}
          aria-label="Katak ko'rinishi"
        >
          <LayoutGrid className="h-4 w-4" />
        </Link>
        <Link
          href={viewHref('list', activeFilter, query)}
          className={cn(
            'tap-press grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition sm:h-10 sm:w-10',
            view === 'list' && 'bg-accent text-accent-foreground',
          )}
          aria-label="Ro'yxat ko'rinishi"
        >
          <List className="h-4 w-4" />
        </Link>
        </div>
      </div>
    </div>
  );
}

function BrowseEmpty({ query }: { query?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-4 py-16 text-center shadow-card">
      <Package2 className="mx-auto h-10 w-10 text-muted-foreground/50" />
      <h2 className="mt-3 text-base font-bold text-foreground">
        {query ? 'Hech narsa topilmadi' : "Hozircha e'lonlar yo'q"}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {query
          ? "Boshqa kalit so'z yoki filtrni sinab ko'ring."
          : "Birinchi bo'lib akkountingizni sotishga qo'ying."}
      </p>
      <Button asChild className="mt-4">
        <Link href="/marketplace/new">
          <Plus className="h-4 w-4" /> Akkount joylash
        </Link>
      </Button>
    </div>
  );
}

function browseHref(
  filters: ListingBrowseParams,
  activeFilter: MarketplaceFilterId,
  query: string | undefined,
  view: 'grid' | 'list',
  page: number,
) {
  const search = buildListingSearchParams({ ...filters, page });
  if (activeFilter !== 'all') search.set('filter', activeFilter);
  if (query) search.set('q', query);
  if (view === 'list') search.set('view', 'list');
  return `/marketplace?${search.toString()}`;
}

function viewHref(view: 'grid' | 'list', activeFilter: MarketplaceFilterId, query?: string) {
  const params = new URLSearchParams();
  if (activeFilter !== 'all') params.set('filter', activeFilter);
  if (query) params.set('q', query);
  if (view === 'list') params.set('view', 'list');
  return params.toString() ? `/marketplace?${params.toString()}` : '/marketplace';
}
