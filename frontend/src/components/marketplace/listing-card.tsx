import Link from 'next/link';
import { BadgeCheck, Coins, Gamepad2, Heart, ShieldCheck } from 'lucide-react';

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
  attributeStringList,
  type ListingResponse,
} from '@/lib/marketplace-types';

interface ListingCardProps {
  listing: ListingResponse;
}

export function ListingCard({ listing }: ListingCardProps) {
  const title = listing.description.split('\n')[0]?.trim() || 'eFootball account';
  const preview = listing.description.replace(/\s+/g, ' ').slice(0, 120);
  const isSold = listing.status === 'SOLD';

  const division = attributeNumber(listing, 'highest_division_level');
  const teamStrength = attributeNumber(listing, 'team_strength');
  const androidCoins = attributeNumber(listing, 'android_coins') ?? 0;
  const iosCoins = attributeNumber(listing, 'ios_coins') ?? 0;
  const hasGooglePlayLink = attributeBoolean(listing, 'has_google_play_link');
  const valuablePlayers = attributeStringList(listing, 'valuable_players');
  const coverUrl = listingMediaUrls(listing, 1)[0];

  return (
    <article className="rounded-xl border border-border bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover">
      {coverUrl && (
        <Link
          href={`/marketplace/${listing.id}`}
          className="mb-4 block overflow-hidden rounded-lg border border-border bg-muted"
        >
          <img
            src={coverUrl}
            alt={`${title} rasmi`}
            loading="lazy"
            decoding="async"
            className="aspect-[16/10] w-full object-cover transition duration-300 hover:scale-[1.02]"
          />
        </Link>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/marketplace/${listing.id}`} className="block">
            <h2 className="line-clamp-2 text-base font-bold leading-snug text-foreground">
              {title}
            </h2>
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatListingDate(listing.createdAt)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-black text-foreground">{formatPriceUZS(listing.price)}</div>
          {listing.priceNegotiable && (
            <div className="mt-1 text-xs font-semibold text-secondary">savdolashish</div>
          )}
        </div>
      </div>

      <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">{preview}</p>

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <Metric
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          label="Division"
          value={divisionLabel(division).replace('Division ', '')}
        />
        <Metric
          icon={<Gamepad2 className="h-3.5 w-3.5" />}
          label="Strength"
          value={teamStrength === undefined ? '-' : formatCompactNumber(teamStrength)}
        />
        <Metric
          icon={<Coins className="h-3.5 w-3.5" />}
          label="Coins"
          value={formatCompactNumber(androidCoins + iosCoins)}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {isSold && <Badge variant="warn">sotilgan</Badge>}
        {hasGooglePlayLink && (
          <Badge variant="muted">
            <BadgeCheck className="h-3 w-3" />
            Google
          </Badge>
        )}
        <Badge variant={listing.likedByMe ? 'default' : 'muted'}>
          <Heart className="h-3 w-3" />
          {formatCompactNumber(listing.likeCount)}
        </Badge>
        {valuablePlayers.slice(0, 4).map((player) => (
          <Badge key={player} variant="muted">
            {player}
          </Badge>
        ))}
      </div>
    </article>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/60 p-2">
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 truncate font-black text-foreground">{value}</div>
    </div>
  );
}
