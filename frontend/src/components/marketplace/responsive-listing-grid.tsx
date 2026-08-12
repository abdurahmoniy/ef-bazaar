import { ListingCard, type ListingCardLayout } from '@/components/marketplace/listing-card';
import type { MarketplaceView } from '@/lib/marketplace-query';
import type { ListingResponse } from '@/lib/marketplace-types';
import type { PlayerMatchCriterion } from '@/lib/player-match-query';

export function ResponsiveListingGrid({
  listings,
  view,
  rawQuery,
  matchCriteria,
}: {
  listings: ListingResponse[];
  view: MarketplaceView;
  rawQuery: string;
  matchCriteria: PlayerMatchCriterion[];
}) {
  const layout: ListingCardLayout = view === 'list'
    ? 'horizontal'
    : view === 'grid'
      ? 'vertical'
      : 'auto';

  return (
    <div className="marketplace-results-container">
      <ul className="marketplace-listings m-0 list-none p-0" data-view={view}>
        {listings.map((listing, index) => (
          <li key={listing.id} className="min-w-0">
            <ListingCard
              listing={listing}
              layout={layout}
              matchCriteria={matchCriteria}
              detailQuery={rawQuery}
              trackFeedNavigation
              priority={index === 0}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ResponsiveListingGridSkeleton({
  count = 6,
  label = 'E‘lonlar yuklanmoqda',
}: {
  count?: number;
  label?: string;
}) {
  return (
    <div className="marketplace-results-container" role="status" aria-label={label}>
      <ul
        className="marketplace-listings m-0 list-none p-0"
        data-view="auto"
        aria-hidden="true"
      >
        {Array.from({ length: count }, (_, index) => (
          <li
            key={index}
            className="listing-card overflow-hidden rounded-xl border border-border bg-card shadow-card"
            data-layout="auto"
          >
            <div className="listing-card__media aspect-[4/3] animate-pulse bg-muted motion-reduce:animate-none" />
            <div className="listing-card__content space-y-2 p-3">
              <div className="h-5 w-2/3 rounded bg-muted" />
              <div className="h-4 w-full rounded bg-muted" />
              <div className="h-4 w-1/2 rounded bg-muted" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
