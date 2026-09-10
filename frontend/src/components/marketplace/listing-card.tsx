import Image from 'next/image';
import { ArrowLeftRight, ShieldCheck, TriangleAlert } from 'lucide-react';

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
  const linkedWarning =
    model.googlePlayLinked && model.gameCenterLinked
      ? { service: 'google-play' as const, label: 'Google Play +1' }
      : model.googlePlayLinked
        ? { service: 'google-play' as const, label: 'Google Play' }
        : model.gameCenterLinked
          ? { service: 'game-center' as const, label: 'Game Center' }
          : null;
  const hasCoins = model.coins !== undefined || model.androidCoins !== undefined || model.iosCoins !== undefined;

  return (
    <article
      id={`marketplace-listing-${listing.id}`}
      aria-labelledby={titleId}
      data-marketplace-listing-id={listing.id}
      data-layout={resolvedLayout}
      className="listing-card group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-card transition focus-within:ring-2 focus-within:ring-ring/40 hover:border-primary/40 hover:shadow-card-hover"
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

      <div className="listing-card__content pointer-events-none flex min-w-0 flex-col gap-1.5 p-2.5 sm:gap-2 sm:p-3">
        <div className="flex items-center justify-between gap-1.5">
          <span className="truncate whitespace-nowrap text-sm font-extrabold leading-tight text-[hsl(var(--price))] sm:text-base">
            {model.price}
          </span>
          {model.exchange && <ExchangeBadge label={model.exchangeLabel} />}
        </div>

        <h2 id={titleId} className="sr-only">
          {model.title}
        </h2>

        <div className="listing-card__facts flex flex-wrap items-center gap-1 pt-0.5 sm:gap-1.5">
          {model.clean && <CleanBadge />}
          {linkedWarning && (
            <LinkedServiceWarning
              service={linkedWarning.service}
              label={linkedWarning.label}
            />
          )}
          {hasCoins && (
            <CoinsPill
              coins={model.coins}
              androidCoins={model.androidCoins}
              iosCoins={model.iosCoins}
            />
          )}
        </div>
      </div>
    </article>
  );
}

function CleanBadge() {
  return (
    <div
      data-clean-account-badge="true"
      className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-[10px]"
    >
      <ShieldCheck className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
      <span className="truncate">Toza</span>
    </div>
  );
}

function ExchangeBadge({ label }: { label: string | null }) {
  return (
    <span
      data-exchange-badge="true"
      title={label ?? 'Obmen'}
      aria-label={label ?? 'Obmen'}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-primary/10 p-1 text-primary dark:bg-primary/25"
    >
      <ArrowLeftRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
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
      className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full bg-secondary/30 px-2 py-0.5 text-[9px] font-semibold text-secondary-foreground dark:bg-secondary/20 dark:text-secondary sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-[10px]"
    >
      <TriangleAlert className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </div>
  );
}

function CoinsPill({
  coins,
  androidCoins,
  iosCoins,
}: {
  coins?: number;
  androidCoins?: number;
  iosCoins?: number;
}) {
  if (coins === undefined && androidCoins === undefined && iosCoins === undefined) {
    return null;
  }

  const ariaLabel =
    coins !== undefined
      ? `Coin balansi: ${coins}`
      : androidCoins !== undefined && iosCoins !== undefined
      ? `Android coin: ${androidCoins}, iOS coin: ${iosCoins}`
      : androidCoins !== undefined
        ? `Android coin: ${androidCoins}`
        : `iOS coin: ${iosCoins}`;

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[9px] font-semibold text-accent-foreground sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-[10px]"
    >
      <Image
        data-efootball-coin-icon
        src="/icons/efootball-coin.png"
        alt=""
        width={12}
        height={12}
        unoptimized
        className="h-3 w-3 shrink-0 object-contain sm:h-3.5 sm:w-3.5"
      />
      <div className="flex min-w-0 items-center truncate">
        {coins !== undefined && (
          <span className={cn('truncate', coins < 0 && 'text-destructive')}>
            {formatCompactNumber(coins)}
          </span>
        )}
        {androidCoins !== undefined && (
          <span className="truncate">
            <span className="mr-0.5 font-medium text-muted-foreground sm:mr-1">Android</span>
            <span className={cn(androidCoins < 0 && 'text-destructive')}>
              {formatCompactNumber(androidCoins)}
            </span>
          </span>
        )}
        {androidCoins !== undefined && iosCoins !== undefined && (
          <span className="mx-0.5 text-muted-foreground/60 sm:mx-1" aria-hidden="true">
            ·
          </span>
        )}
        {iosCoins !== undefined && (
          <span className="truncate">
            <span className="mr-0.5 font-medium text-muted-foreground sm:mr-1">iOS</span>
            <span className={cn(iosCoins < 0 && 'text-destructive')}>
              {formatCompactNumber(iosCoins)}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

function SoldOverlay() {
  return (
    <div
      role="status"
      className="absolute inset-0 z-[1] flex items-center justify-center bg-black/55"
    >
      <span className="rounded-md bg-white/90 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-destructive sm:px-3 sm:py-1 sm:text-xs">
        Sotilgan
      </span>
    </div>
  );
}
