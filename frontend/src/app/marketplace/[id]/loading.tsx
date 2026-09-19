import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { Skeleton } from '@/components/ui/skeleton';

export default function ListingLoading() {
  return (
    <MarketplaceShell user={null} sessionPending hideSearch hideBottomNav backHref="/marketplace">
      <div role="status" aria-label="E’lon yuklanmoqda" className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-3" aria-hidden="true">
          <Skeleton className="aspect-[19.5/9] w-full rounded-xl" />
          <div className="flex gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-24 rounded-lg" />)}</div>
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
        <div className="space-y-4" aria-hidden="true">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </div>
    </MarketplaceShell>
  );
}
