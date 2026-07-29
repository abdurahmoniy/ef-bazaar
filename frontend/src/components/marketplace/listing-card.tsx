import Link from 'next/link';
import {
  Apple,
  ArrowLeftRight,
  Gamepad2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';

import { DivisionBadge, toDivisionLevel } from '@/components/marketplace/division-badge';
import { ListingLikeButton } from '@/components/marketplace/listing-like-button';
import { Badge } from '@/components/ui/badge';
import {
  divisionLabel,
  formatCompactNumber,
  formatListingDate,
  formatPriceUZS,
} from '@/lib/marketplace-format';
import { listingMediaUrls } from '@/lib/marketplace-media';
import {
  attributeBoolean,
  attributeCardList,
  attributeNumber,
  listingAcceptsExchange,
  type ListingResponse,
} from '@/lib/marketplace-types';

interface ListingCardProps {
  listing: ListingResponse;
  /** When true, renders a compact horizontal layout used by list view / small containers. */
  variant?: 'grid' | 'list';
}

export function ListingCard({ listing, variant = 'grid' }: ListingCardProps) {
  // `likedByMe` is omitted (undefined) by the backend when the viewer is anonymous;
  // presence of the field is a reliable authentication signal.
  const authenticated = listing.likedByMe !== undefined && listing.likedByMe !== null;
  const likedByMe = listing.likedByMe === true;
  const title = listing.description.split('\n')[0]?.trim() || 'eFootball account';
  const isSold = listing.status === 'SOLD';

  const division = attributeNumber(listing, 'highest_division_level');
  const divisionBadgeLevel = toDivisionLevel(division);
  const teamStrength = attributeNumber(listing, 'team_strength');
  const starPlayerCount = attributeCardList(listing, 'valuable_players').length;
  // A store link (Google Play / Game Center) can't be removed, so the previous
  // owner keeps a way back into a transferred account — surface it as a caution.
  const hasGooglePlayLink = attributeBoolean(listing, 'has_google_play_link');
  const hasGameCenterLink = attributeBoolean(listing, 'has_game_center_link');
  const androidCoins = attributeNumber(listing, 'android_coins');
  const iosCoins = attributeNumber(listing, 'ios_coins');
  // Monthly device-transfer sign-ins left. A handover eats two, so anything
  // near the floor is a risk the buyer should see before opening the listing.
  const deviceTransferLimit = attributeNumber(listing, 'device_transfer_limit');
  const transferLimitTight =
    deviceTransferLimit !== undefined && deviceTransferLimit <= 3;
  const acceptsExchange = listingAcceptsExchange(listing);
  const coverUrl = listingMediaUrls(listing, 1)[0];
  const href = `/marketplace/${listing.id}`;

  if (variant === 'list') {
    return (
      <article className="tap-press group relative flex overflow-hidden rounded-xl border border-border bg-card shadow-card transition hover:border-primary/40 hover:shadow-card-hover">
        <Link href={href} className="relative block h-28 w-28 shrink-0 overflow-hidden bg-muted sm:h-40 sm:w-52">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={`${title} rasmi`}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <PlaceholderImage />
          )}
          {isSold && <SoldOverlay />}
        </Link>
        {!isSold && (
          <ListingLikeButton
            listingId={listing.id}
            initialLiked={likedByMe}
            initialCount={listing.likeCount}
            authenticated={authenticated}
            className="absolute left-2 top-2"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-2 p-3 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <Link href={href} className="min-w-0 flex-1">
              <h2 className="line-clamp-2 text-sm font-bold leading-snug text-foreground sm:text-base">
                {title}
              </h2>
            </Link>
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <span className="text-lg font-black text-[hsl(var(--price))] sm:text-xl">
                {formatPriceUZS(listing.price)}
              </span>
              <DealTags negotiable={listing.priceNegotiable} exchange={acceptsExchange} />
            </div>
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-1.5 text-[11px]">
            {divisionBadgeLevel ? (
              <DivisionBadge level={divisionBadgeLevel} size={22} />
            ) : division !== undefined ? (
              <Badge variant="outline">
                <ShieldCheck className="h-3 w-3" /> {divisionLabel(division)}
              </Badge>
            ) : null}
            {teamStrength !== undefined && (
              <Badge variant="outline">
                <Gamepad2 className="h-3 w-3" /> {formatCompactNumber(teamStrength)}
              </Badge>
            )}
            {starPlayerCount > 0 && (
              <Badge variant="outline">
                <Sparkles className="h-3 w-3" /> {starPlayerCount} karta
              </Badge>
            )}
            {androidCoins !== undefined && (
              <Badge variant="outline">
                <Smartphone className="h-3 w-3" /> {formatCompactNumber(androidCoins)}
              </Badge>
            )}
            {iosCoins !== undefined && (
              <Badge variant="outline">
                <Apple className="h-3 w-3" /> {formatCompactNumber(iosCoins)}
              </Badge>
            )}
            {transferLimitTight && (
              <Badge variant="warn">
                <TriangleAlert className="h-3 w-3" /> {deviceTransferLimit} qurilma limiti
              </Badge>
            )}
            {hasGooglePlayLink && (
              <Badge variant="warn">
                <TriangleAlert className="h-3 w-3" /> Google Play
              </Badge>
            )}
            {hasGameCenterLink && (
              <Badge variant="warn">
                <TriangleAlert className="h-3 w-3" /> Game Center
              </Badge>
            )}
            <span className="ml-auto text-muted-foreground">
              {formatListingDate(listing.createdAt)}
            </span>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="tap-press group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-card transition hover:border-primary/40 hover:shadow-card-hover">
      <Link href={href} className="relative block overflow-hidden bg-muted">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={`${title} rasmi`}
            loading="lazy"
            decoding="async"
            className="aspect-[4/3] w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="aspect-[4/3] w-full">
            <PlaceholderImage />
          </div>
        )}
        {isSold && <SoldOverlay />}
        {divisionBadgeLevel ? (
          <div className="absolute left-2 top-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
            <DivisionBadge level={divisionBadgeLevel} size={40} />
          </div>
        ) : division !== undefined ? (
          <div className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
            {divisionLabel(division)}
          </div>
        ) : null}
      </Link>
      {!isSold && (
        <ListingLikeButton
          listingId={listing.id}
          initialLiked={likedByMe}
          initialCount={listing.likeCount}
          authenticated={authenticated}
          className="absolute right-2 top-2"
        />
      )}

      {/* Padding and type step down at the 2-column phone width — the card is
          ~165px wide there, so desktop sizing would wrap the price. */}
      <div className="flex flex-1 flex-col gap-1.5 p-2.5 sm:gap-2 sm:p-3">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="whitespace-nowrap text-base font-black leading-none text-[hsl(var(--price))] sm:text-lg">
            {formatPriceUZS(listing.price)}
          </span>
          <DealTags negotiable={listing.priceNegotiable} exchange={acceptsExchange} />
        </div>
        <Link href={href}>
          <h2 className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground sm:text-sm">
            {title}
          </h2>
        </Link>
        <div className="mt-auto flex flex-wrap gap-1 pt-1 text-[11px] sm:gap-1.5">
          {teamStrength !== undefined && (
            <Metric icon={<Gamepad2 className="h-3 w-3" />} value={formatCompactNumber(teamStrength)} />
          )}
          {starPlayerCount > 0 && (
            <Metric icon={<Sparkles className="h-3 w-3" />} value={`${starPlayerCount} karta`} />
          )}
          {androidCoins !== undefined && (
            <Metric icon={<Smartphone className="h-3 w-3" />} value={formatCompactNumber(androidCoins)} />
          )}
          {iosCoins !== undefined && (
            <Metric icon={<Apple className="h-3 w-3" />} value={formatCompactNumber(iosCoins)} />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
          <span>{formatListingDate(listing.createdAt)}</span>
          {(transferLimitTight || hasGooglePlayLink || hasGameCenterLink) && (
            <span className="ml-auto inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-300">
              <TriangleAlert className="h-3 w-3" />
              {[
                transferLimitTight && `${deviceTransferLimit} qurilma limiti`,
                hasGooglePlayLink && 'Google Play',
                hasGameCenterLink && 'Game Center',
              ]
                .filter(Boolean)
                .join(' + ')}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

/** Compact "savdo" / "obmen" tags shown next to the price. */
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
          <ArrowLeftRight className="h-2.5 w-2.5" /> obmen
        </span>
      )}
    </span>
  );
}

function Metric({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-1 rounded-md bg-muted/70 px-1.5 py-1">
      <span className="text-muted-foreground">{icon}</span>
      <span className="truncate font-bold text-foreground">{value}</span>
    </div>
  );
}

function SoldOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/55">
      <span className="rounded-md bg-white/90 px-3 py-1 text-xs font-black uppercase tracking-wider text-destructive">
        Sotilgan
      </span>
    </div>
  );
}

function PlaceholderImage() {
  return (
    <div className="grid h-full w-full place-items-center bg-gradient-to-br from-muted to-muted/40 text-4xl font-black text-muted-foreground/40">
      ef
    </div>
  );
}
