import Image from 'next/image';
import { ArrowLeftRight } from 'lucide-react';

import { ListingCardMedia } from '@/components/marketplace/listing-card-media';
import { buildListingCardModel } from '@/components/marketplace/listing-card-model';
import { ListingLikeButton } from '@/components/marketplace/listing-like-button';
import { MarketplaceListingLink } from '@/components/marketplace/marketplace-listing-link';
import { formatCompactNumber } from '@/lib/marketplace-format';
import { listingMediaUrls } from '@/lib/marketplace-media';
import type { ListingResponse } from '@/lib/marketplace-types';
import type { PlayerMatchCriterion } from '@/lib/player-match-query';

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

        <div className="listing-card__facts grid gap-2">
          {(model.googlePlayLinked || model.gameCenterLinked) && (
            <div
              data-listing-linked-services
              className="flex min-h-10 items-center gap-2 rounded-lg bg-muted/65 px-2.5 py-2"
            >
              {model.googlePlayLinked && <ServiceIcon src="/icons/google.svg" label="Google Play" />}
              {model.gameCenterLinked && <ServiceIcon src="/icons/apple.svg" label="Game Center" />}
            </div>
          )}

          {(model.androidCoins !== undefined || model.iosCoins !== undefined) && (
            <div className="flex min-h-10 items-center gap-3 rounded-lg bg-muted/65 px-2.5 py-2 text-[11px]">
              {model.androidCoins !== undefined && <CoinFact platform="Android" value={model.androidCoins} />}
              {model.iosCoins !== undefined && <CoinFact platform="iOS" value={model.iosCoins} />}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function ExchangeTag({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-2 py-1 text-[10px] font-bold text-accent-foreground">
      <ArrowLeftRight className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}

function ServiceIcon({ src, label }: { src: string; label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-bold text-foreground">
      <Image src={src} alt="" width={18} height={18} unoptimized className="h-[18px] w-[18px] shrink-0 object-contain" />
      <span className="truncate">{label}</span>
    </div>
  );
}

function CoinFact({ platform, value }: { platform: 'Android' | 'iOS'; value: number }) {
  return (
    <div role="group" aria-label={`${platform} coin: ${value}`} className="flex min-w-0 items-center gap-1.5">
      <Image
        data-efootball-coin-icon
        src="/icons/efootball-coin.svg"
        alt=""
        width={18}
        height={18}
        unoptimized
        className="h-[18px] w-[18px] shrink-0 object-contain"
      />
      <span className="min-w-0">
        <span className="block text-[9px] font-semibold leading-none text-muted-foreground">{platform}</span>
        <span className="block truncate font-black leading-tight text-foreground">{formatCompactNumber(value)}</span>
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
