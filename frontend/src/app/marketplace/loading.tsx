import { ResponsiveListingGridSkeleton } from '@/components/marketplace/responsive-listing-grid';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { Skeleton } from '@/components/ui/skeleton';

export default function MarketplaceLoading() {
  return (
    <MarketplaceShell user={null} activeTab="home" collapsibleSearch>
      <div
        data-marketplace-route-loading="true"
        className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-6"
      >
        <FilterSidebarSkeleton />

        <div className="min-w-0 space-y-3">
          <div className="space-y-2" aria-hidden="true">
            <Skeleton className="h-7 w-52 max-w-[72%] rounded-lg sm:h-8 sm:w-64" />
            <div className="marketplace-toolbar-actions">
              <Skeleton className="h-11 w-full rounded-lg" />
              <Skeleton className="h-11 w-full rounded-lg" />
              <Skeleton className="h-11 w-full rounded-lg" />
              <Skeleton className="h-11 w-full rounded-lg" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-20 rounded" />
              <Skeleton className="h-4 w-28 rounded" />
            </div>
            <div className="flex gap-2 overflow-hidden">
              <Skeleton className="h-9 w-20 shrink-0 rounded-full" />
              <Skeleton className="h-9 w-24 shrink-0 rounded-full" />
              <Skeleton className="h-9 w-20 shrink-0 rounded-full" />
            </div>
          </div>

          <ResponsiveListingGridSkeleton />
        </div>
      </div>
    </MarketplaceShell>
  );
}

function FilterSidebarSkeleton() {
  return (
    <aside
      data-filter-sidebar-skeleton
      aria-hidden="true"
      className="hidden rounded-xl border border-border bg-card p-4 shadow-card lg:block"
    >
      <Skeleton className="mb-5 h-6 w-24" />
      {[0, 1, 2].map((group) => (
        <div key={group} className="mb-5 space-y-3 border-b border-border pb-5 last:mb-0 last:border-0 last:pb-0">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-11 w-full rounded-lg" />
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-11 rounded-lg" />
            <Skeleton className="h-11 rounded-lg" />
          </div>
        </div>
      ))}
    </aside>
  );
}
