import {
  Apple,
  ArrowLeftRight,
  Gamepad2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { DivisionBadge, toDivisionLevel } from '@/components/marketplace/division-badge';
import { ListingCardMedia } from '@/components/marketplace/listing-card-media';
import { buildListingCardModel } from '@/components/marketplace/listing-card-model';
import { ListingLikeButton } from '@/components/marketplace/listing-like-button';
import { MarketplaceListingLink } from '@/components/marketplace/marketplace-listing-link';
import { divisionLabel, formatCompactNumber } from '@/lib/marketplace-format';
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
  /** Compatibility for profile, landing, and related-listing callers. */
  variant?: 'grid' | 'list';
}

export function ListingCard({
  listing,
  layout,
  matchCriteria = [],
  detailQuery = '',
  priority = false,
  variant,
}: ListingCardProps) {
  const resolvedLayout = layout ?? (variant === 'list' ? 'horizontal' : 'vertical');
  const model = buildListingCardModel(listing, matchCriteria);
  const coverUrl = listingMediaUrls(listing, 1)[0];
  const divisionBadgeLevel = toDivisionLevel(model.division);
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
          <DealTags negotiable={model.negotiable} exchange={model.exchange} />
        </div>

        {model.matchLabel && (
          <div className="inline-flex w-fit items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-black text-primary">
            <Target className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{model.matchLabel}</span>
          </div>
        )}

        {model.playerNames.length > 0 && (
          <div className="flex min-w-0 items-start gap-1.5 text-xs font-semibold text-foreground">
            <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 leading-5">
              {model.playerNames.map((name, index) => (
                <span key={`${name}-${index}`}>
                  {index > 0 && <span aria-hidden="true"> · </span>}
                  {name}
                </span>
              ))}
              {model.playerRemainder > 0 && (
                <span className="text-muted-foreground"> +{model.playerRemainder}</span>
              )}
            </span>
            {model.hasMetaCard && (
              <span
                aria-label="META karta mavjud"
                className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-black tracking-wide text-primary"
              >
                META
              </span>
            )}
          </div>
        )}

        {model.playerNames.length === 0 && model.hasMetaCard && (
          <span
            aria-label="META karta mavjud"
            className="w-fit rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-black tracking-wide text-primary"
          >
            META
          </span>
        )}

        <h2 id={titleId} className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
          {model.title}
        </h2>

        {(model.division !== undefined || model.teamStrength !== undefined) && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {divisionBadgeLevel ? (
              <Metric
                icon={<DivisionBadge level={divisionBadgeLevel} size={22} />}
                value={divisionLabel(model.division)}
              />
            ) : model.division !== undefined ? (
              <Metric
                icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
                value={divisionLabel(model.division)}
              />
            ) : null}
            {model.teamStrength !== undefined && (
              <Metric
                icon={<Gamepad2 className="h-3.5 w-3.5" aria-hidden="true" />}
                value={formatCompactNumber(model.teamStrength)}
              />
            )}
          </div>
        )}

        {(model.valuableCount > 0 || model.androidCoins !== undefined || model.iosCoins !== undefined) && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {model.valuableCount > 0 && (
              <Metric
                icon={<Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
                value={`${model.valuableCount} karta`}
              />
            )}
            {model.androidCoins !== undefined && (
              <Metric
                icon={<Smartphone className="h-3.5 w-3.5" aria-hidden="true" />}
                value={formatCompactNumber(model.androidCoins)}
              />
            )}
            {model.iosCoins !== undefined && (
              <Metric
                icon={<Apple className="h-3.5 w-3.5" aria-hidden="true" />}
                value={formatCompactNumber(model.iosCoins)}
              />
            )}
          </div>
        )}

        {model.safety && (
          <div
            className={cn(
              'inline-flex w-fit items-center gap-1 text-[11px] font-bold',
              model.safety.tone === 'warning'
                ? 'text-amber-700 dark:text-amber-300'
                : 'text-emerald-700 dark:text-emerald-300',
            )}
          >
            {model.safety.tone === 'warning' ? (
              <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>{model.safety.label}</span>
          </div>
        )}

        <time
          dateTime={listing.createdAt}
          className="mt-auto text-[11px] text-muted-foreground"
        >
          {model.date}
        </time>
      </div>
    </article>
  );
}

function DealTags({ negotiable, exchange }: { negotiable: boolean; exchange: boolean }) {
  if (!negotiable && !exchange) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      {negotiable && (
        <span className="rounded-full bg-[hsl(var(--price)/0.14)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--price))]">
          savdo
        </span>
      )}
      {exchange && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-foreground">
          <ArrowLeftRight className="h-2.5 w-2.5" aria-hidden="true" /> obmen
        </span>
      )}
    </span>
  );
}

function Metric({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1 rounded-md bg-muted/70 px-1.5 py-1">
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="truncate font-bold text-foreground">{value}</span>
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
