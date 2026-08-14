import Image from 'next/image';
import { Check, TriangleAlert } from 'lucide-react';

import { ListingCardMedia } from '@/components/marketplace/listing-card-media';
import { buildListingCardModel } from '@/components/marketplace/listing-card-model';
import { ListingLikeButton } from '@/components/marketplace/listing-like-button';
import { MarketplaceListingLink } from '@/components/marketplace/marketplace-listing-link';
import { formatCompactNumber } from '@/lib/marketplace-format';
import { listingMediaUrls } from '@/lib/marketplace-media';
import type { ListingResponse } from '@/lib/marketplace-types';
import type { PlayerMatchCriterion } from '@/lib/player-match-query';
import { cn } from '@/lib/utils';

export type ListingCardLayout = 'auto' | 'horizontal' | 'vertical';

interface ListingCardProps {
  listing: ListingResponse;
  layout?: ListingCardLayout;
  matchCriteria?: PlayerMatchCriterion[];
  /** Originating marketplace query so detail and Back preserve match context. */
  detailQuery?: string;
  priority?: boolean;
  /** Opted in only by the main marketplace feed. */
  trackFeedNavigation?: boolean;
  /** Compatibility for profile, landing, and related-listing callers. */
  variant?: 'grid' | 'list';
}

export function ListingCard({
  listing,
  layout,
  matchCriteria = [],
  detailQuery = '',
  priority = false,
  trackFeedNavigation = false,
  variant,
}: ListingCardProps) {
  const resolvedLayout = layout ?? (variant === 'list' ? 'horizontal' : 'vertical');
  const model = buildListingCardModel(listing, matchCriteria);
  const coverUrl = listingMediaUrls(listing, 1)[0];
  const authenticated = listing.likedByMe !== undefined && listing.likedByMe !== null;
  const titleId = `marketplace-listing-${listing.id}-title`;

  return (
    <article
      id={`marketplace-listing-${listing.id}`}
      aria-labelledby={titleId}
      data-marketplace-listing-id={listing.id}
      data-layout={resolvedLayout}
      className="listing-card group relative overflow-hidden rounded-xl border border-border bg-card shadow-card transition focus-within:ring-2 focus-within:ring-ring/40 hover:border-primary/40 hover:shadow-card-hover"
    >
      <MarketplaceListingLink
        listingId={listing.id}
        href={`/marketplace/${listing.id}`}
        rawQuery={detailQuery}
        trackFeedNavigation={trackFeedNavigation}
        className="absolute inset-0 z-10 cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="sr-only">{model.title} e&apos;lonini ochish</span>
      </MarketplaceListingLink>

      <ListingCardMedia
        src={coverUrl}
        alt={`${model.title} rasmi`}
        priority={priority}
      >
        {model.sold && <SoldOverlay />}
      </ListingCardMedia>

      {!model.sold && (
        <ListingLikeButton
          listingId={listing.id}
          initialLiked={listing.likedByMe === true}
          initialCount={listing.likeCount}
          authenticated={authenticated}
          className="listing-card__favorite absolute right-2 top-2 z-20"
        />
      )}

      <div className="listing-card__content pointer-events-none flex min-w-0 flex-1 flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="whitespace-nowrap text-lg font-black leading-none text-[hsl(var(--price))]">
            {model.price}
          </span>
          {model.exchangeLabel && <ExchangeTag label={model.exchangeLabel} />}
        </div>

        <h2 id={titleId} className="sr-only">
          {model.title}
        </h2>

        <div className="listing-card__facts flex flex-wrap gap-1.5 pt-0.5">
          {model.googlePlayLinked && (
            <LinkedServiceWarning service="google-play" label="Google Play" />
          )}
          {model.gameCenterLinked && (
            <LinkedServiceWarning service="game-center" label="Game Center" />
          )}
          {model.androidCoins !== undefined && (
            <CoinPill platform="Android" value={model.androidCoins} />
          )}
          {model.iosCoins !== undefined && (
            <CoinPill platform="iOS" value={model.iosCoins} />
          )}
        </div>
      </div>
    </article>
  );
}

function ExchangeTag({ label }: { label: string }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary dark:bg-primary/25">
      <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </span>
  );
}

function LinkedServiceWarning({
  service,
  label,
}: {
  service: 'google-play' | 'game-center';
  label: string;
}) {
  return (
    <div
      data-linked-service-warning={service}
      className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-secondary/30 px-2.5 py-1 text-[10px] font-bold text-secondary-foreground dark:bg-secondary/20 dark:text-secondary"
    >
      <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </div>
  );
}


function CoinPill({ platform, value }: { platform: 'Android' | 'iOS'; value: number }) {
  return (
    <div
      role="group"
      aria-label={`${platform} coin: ${value}`}
      className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-[10px] font-bold text-accent-foreground"
    >
      <Image
        data-efootball-coin-icon
        src="/icons/efootball-coin.png"
        alt=""
        width={14}
        height={14}
        unoptimized
        className="h-3.5 w-3.5 shrink-0 object-contain"
      />
      <span className="truncate">
        <span className="font-semibold text-muted-foreground mr-1">{platform}</span>
        <span className={cn(value < 0 && 'text-destructive')}>{formatCompactNumber(value)}</span>
      </span>
    </div>
  );
}

function SoldOverlay() {
  return (
    <div
      role="status"
      className="absolute inset-0 z-[1] flex items-center justify-center bg-black/55"
    >
      <span className="rounded-md bg-white/90 px-3 py-1 text-xs font-black uppercase tracking-wider text-destructive">
        Sotilgan
      </span>
    </div>
  );
}
