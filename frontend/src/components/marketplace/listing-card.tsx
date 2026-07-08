import Link from 'next/link';
import { Apple, BadgeCheck, Gamepad2, ShieldCheck, Smartphone } from 'lucide-react';

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
  attributeNumber,
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
  const teamStrength = attributeNumber(listing, 'team_strength');
  const hasGooglePlayLink = attributeBoolean(listing, 'has_google_play_link');
  const hasGameCenterLink = attributeBoolean(listing, 'has_game_center_link');
  // Only surface coin balances for platforms actually bound to the account —
  // an iOS-only account can't hold Android coins (see AttributeValidator).
  const androidCoins = hasGooglePlayLink ? attributeNumber(listing, 'android_coins') ?? 0 : 0;
  const iosCoins = hasGameCenterLink ? attributeNumber(listing, 'ios_coins') ?? 0 : 0;
  const coverUrl = listingMediaUrls(listing, 1)[0];
  const href = `/marketplace/${listing.id}`;

  if (variant === 'list') {
    return (
      <article className="group relative flex overflow-hidden rounded-xl border border-border bg-card shadow-card transition hover:border-primary/40 hover:shadow-card-hover">
        <Link href={href} className="relative block h-32 w-32 shrink-0 overflow-hidden bg-muted sm:h-40 sm:w-52">
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
            <span className="text-lg font-black text-[hsl(var(--price))] sm:text-xl">
              {formatPriceUZS(listing.price)}
            </span>
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-1.5 text-[11px]">
            {division !== undefined && (
              <Badge variant="outline">
                <ShieldCheck className="h-3 w-3" /> Div {division}
              </Badge>
            )}
            {teamStrength !== undefined && (
              <Badge variant="outline">
                <Gamepad2 className="h-3 w-3" /> {formatCompactNumber(teamStrength)}
              </Badge>
            )}
            <Badge variant="outline">
              <Smartphone className="h-3 w-3" /> {formatCompactNumber(androidCoins)}
            </Badge>
            <Badge variant="outline">
              <Apple className="h-3 w-3" /> {formatCompactNumber(iosCoins)}
            </Badge>
            {listing.priceNegotiable && <Badge variant="price">savdolashish</Badge>}
            {hasGooglePlayLink && (
              <Badge variant="verified">
                <BadgeCheck className="h-3 w-3" /> Google
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
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-card transition hover:border-primary/40 hover:shadow-card-hover">
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
        {division !== undefined && (
          <div className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
            {divisionLabel(division)}
          </div>
        )}
        {teamStrength !== undefined && (
          <div className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
            <Gamepad2 className="h-3 w-3" /> {formatCompactNumber(teamStrength)}
          </div>
        )}
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

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-lg font-black leading-none text-[hsl(var(--price))]">
            {formatPriceUZS(listing.price)}
          </span>
          {listing.priceNegotiable && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-secondary-foreground/70">
              savdolashish
            </span>
          )}
        </div>
        <Link href={href}>
          <h2 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
            {title}
          </h2>
        </Link>
        <div className="mt-auto grid grid-cols-2 gap-1.5 pt-1 text-[11px]">
          <Metric
            icon={<Smartphone className="h-3 w-3" />}
            value={formatCompactNumber(androidCoins)}
            label="Android"
          />
          <Metric
            icon={<Apple className="h-3 w-3" />}
            value={formatCompactNumber(iosCoins)}
            label="iOS"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
          <span>{formatListingDate(listing.createdAt)}</span>
          {hasGooglePlayLink && (
            <span className="ml-auto inline-flex items-center gap-1 font-semibold text-primary">
              <BadgeCheck className="h-3 w-3" /> Google
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function Metric({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center justify-center gap-1 rounded-md bg-muted/70 px-1.5 py-1">
      <span className="text-muted-foreground">{icon}</span>
      <span className="truncate font-bold text-foreground">{value}</span>
      <span className="hidden truncate text-muted-foreground sm:inline">{label}</span>
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
