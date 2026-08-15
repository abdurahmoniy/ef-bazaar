import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { Skeleton } from '@/components/ui/skeleton';

export default function WalletLoading() {
  return (
    <MarketplaceShell user={null} activeTab="wallet" hideSearch hideHeader backHref="/profile">
      <div className="space-y-4" aria-hidden="true">
        <div className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-6">
          <Skeleton className="h-4 w-20 rounded" />
          <Skeleton className="mt-2 h-10 w-56 max-w-[80%] rounded-lg" />
          <Skeleton className="mt-2 h-4 w-40 rounded" />
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-6">
          <Skeleton className="h-5 w-44 rounded" />
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Skeleton className="h-11 rounded-lg" />
            <Skeleton className="h-11 rounded-lg" />
            <Skeleton className="h-11 rounded-lg" />
            <Skeleton className="h-11 rounded-lg" />
          </div>
          <Skeleton className="mt-3 h-11 w-full rounded-lg" />
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-6">
          <Skeleton className="h-5 w-28 rounded" />
          <div className="mt-3 space-y-3">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-32 rounded" />
                  <Skeleton className="h-3 w-24 rounded" />
                </div>
                <Skeleton className="h-4 w-20 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </MarketplaceShell>
  );
}
