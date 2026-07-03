import Link from 'next/link';
import { LayoutGrid, List, Package2, Plus } from 'lucide-react';

import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import { ListingCard } from '@/components/marketplace/listing-card';
import { ListingFilters, QuickChips } from '@/components/marketplace/listing-filters';
import { ListingsPagination } from '@/components/marketplace/listings-pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  buildListingSearchParams,
  formatCompactNumber,
  type MarketplaceFilterId,
} from '@/lib/marketplace-format';
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
  const page = result.ok ? result.data : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-6">
      <ListingFilters
        activeFilter={activeFilter}
        query={query}
        minPrice={filters.minPrice}
        maxPrice={filters.maxPrice}
        division={Number.isFinite(divisionValue) ? divisionValue : undefined}
        sortParam={filters.sort}
      />

      <section className="min-w-0 space-y-3">
        <BrowseHeader
          activeFilter={activeFilter}
          query={query}
          view={view}
          totalElements={page?.totalElements ?? 0}
        />

        <div className="lg:hidden">
          <QuickChips activeFilter={activeFilter} query={query} />
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
                  : 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3',
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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-72 rounded-xl" />
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
}: {
  activeFilter: MarketplaceFilterId;
  query?: string;
  view: 'grid' | 'list';
  totalElements: number;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-primary">Marketplace</p>
        <h1 className="mt-1 text-2xl font-black leading-tight text-foreground">
          {query ? `"${query}" bo'yicha natijalar` : 'eFootball akkountlar'}
        </h1>
        <p className="mt-1 text-xs font-semibold text-muted-foreground">
          {formatCompactNumber(totalElements)} ta e'lon
        </p>
      </div>
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-card">
        <Link
          href={viewHref('grid', activeFilter, query)}
          className={cn(
            'grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition',
            view === 'grid' && 'bg-accent text-accent-foreground',
          )}
          aria-label="Katak ko'rinishi"
        >
          <LayoutGrid className="h-4 w-4" />
        </Link>
        <Link
          href={viewHref('list', activeFilter, query)}
          className={cn(
            'grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition',
            view === 'list' && 'bg-accent text-accent-foreground',
          )}
          aria-label="Ro'yxat ko'rinishi"
        >
          <List className="h-4 w-4" />
        </Link>
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
