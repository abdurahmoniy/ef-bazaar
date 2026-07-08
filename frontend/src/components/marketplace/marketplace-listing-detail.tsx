import { BadgeCheck, Coins, Gamepad2, MapPin, ShieldCheck, Sparkles } from 'lucide-react';

import { ListingActions } from '@/components/marketplace/listing-actions';
import { ListingCard } from '@/components/marketplace/listing-card';
import { ListingMediaGallery } from '@/components/marketplace/listing-media-gallery';
import { PlayerCardTile } from '@/components/marketplace/player-card-tile';
import { SellerCard } from '@/components/marketplace/seller-card';
import { ShareListingButton } from '@/components/marketplace/share-listing-button';
import { BackLink } from '@/components/navigation/back-link';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
  attributeCardList,
  type ListingResponse,
} from '@/lib/marketplace-types';
import type { User } from '@/lib/types';

interface MarketplaceListingDetailProps {
  listing: ListingResponse;
  viewer: User | null;
  seller: User | null;
  similarListings: ListingResponse[];
}

export function MarketplaceListingDetail({
  listing,
  viewer,
  seller,
  similarListings,
}: MarketplaceListingDetailProps) {
  const title = listing.description.split('\n')[0]?.trim() || 'eFootball account';
  const restDescription = listing.description
    .split('\n')
    .slice(1)
    .join('\n')
    .trim();
  const mediaUrls = listingMediaUrls(listing);
  const division = attributeNumber(listing, 'highest_division_level');
  const teamStrength = attributeNumber(listing, 'team_strength');
  const hasGooglePlayLink = attributeBoolean(listing, 'has_google_play_link');
  const hasGameCenterLink = attributeBoolean(listing, 'has_game_center_link');
  // Zero-out coin display for platforms the account isn't bound to; matches
  // the backend cross-field rule that rejects orphaned coin balances.
  const androidCoins = hasGooglePlayLink ? attributeNumber(listing, 'android_coins') ?? 0 : 0;
  const iosCoins = hasGameCenterLink ? attributeNumber(listing, 'ios_coins') ?? 0 : 0;
  const exchangeMode = typeof listing.attributes?.exchange_mode === 'string'
    ? (listing.attributes.exchange_mode as string)
    : undefined;
  const valuablePlayers = attributeCardList(listing, 'valuable_players');
  const authenticated = viewer !== null;
  const isOwner = viewer?.id === listing.sellerId;

  return (
    <article className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <BackLink href="/marketplace" label="Bozor" />
        <ShareListingButton listingId={listing.id} title={title} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6">
        <div className="min-w-0 space-y-4">
          <ListingMediaGallery title={title} urls={mediaUrls} />

          <div className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-primary">
                  {divisionLabel(division)}
                </p>
                <h1 className="mt-1 text-xl font-black leading-tight text-foreground sm:text-2xl">
                  {title}
                </h1>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatListingDate(listing.createdAt)} • ID: {listing.id.slice(0, 8)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {listing.status === 'SOLD' && <Badge variant="danger">Sotilgan</Badge>}
                {listing.priceNegotiable && <Badge variant="price">Savdolashish</Badge>}
                {hasGooglePlayLink && (
                  <Badge variant="verified">
                    <BadgeCheck className="h-3 w-3" /> Google ulangan
                  </Badge>
                )}
              </div>
            </div>

            {restDescription && (
              <>
                <Separator className="my-4" />
                <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/85">
                  {restDescription}
                </p>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Division"
              value={division === undefined ? '—' : String(division)}
            />
            <StatCard
              icon={<Gamepad2 className="h-4 w-4" />}
              label="Team strength"
              value={teamStrength === undefined ? '—' : formatCompactNumber(teamStrength)}
            />
            <StatCard
              icon={<Coins className="h-4 w-4" />}
              label="Coins"
              value={formatCompactNumber(androidCoins + iosCoins)}
            />
            <StatCard
              icon={<Sparkles className="h-4 w-4" />}
              label="Kartalar"
              value={valuablePlayers.length ? formatCompactNumber(valuablePlayers.length) : '—'}
            />
          </div>

          {valuablePlayers.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-6">
              <h2 className="text-sm font-bold text-foreground">Yulduz o'yinchilar</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {valuablePlayers.map((card) => (
                  <PlayerCardTile key={card.efhubId || card.name} card={card} />
                ))}
              </div>
            </div>
          )}

          <AttributeTable
            division={division}
            teamStrength={teamStrength}
            androidCoins={androidCoins}
            iosCoins={iosCoins}
            hasGooglePlayLink={hasGooglePlayLink}
            hasGameCenterLink={hasGameCenterLink}
            exchangeMode={exchangeMode}
            priceNegotiable={listing.priceNegotiable}
          />
        </div>

        <aside className="min-w-0 lg:sticky lg:top-32 lg:self-start">
          <div className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-2xl font-black text-[hsl(var(--price))] sm:text-3xl">
                {formatPriceUZS(listing.price)}
              </span>
              {listing.priceNegotiable && (
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  savdolashish
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3" /> Uzbekistan
            </div>

            <Separator className="my-4" />

            <ListingActions
              listingId={listing.id}
              authenticated={authenticated}
              isOwner={isOwner}
              initialLiked={listing.likedByMe}
              initialLikeCount={listing.likeCount}
            />
          </div>

          <div className="mt-4">
            <SellerCard seller={seller} isViewerOwner={isOwner} />
          </div>
        </aside>
      </div>

      {similarListings.length > 0 && (
        <section className="pt-4">
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-lg font-bold text-foreground">O'xshash e'lonlar</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {similarListings.slice(0, 4).map((entry) => (
              <ListingCard key={entry.id} listing={entry} />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

function exchangeModeLabel(mode?: string): string {
  switch (mode) {
    case 'EXCHANGE_ONLY':           return 'Obmen';
    case 'EXCHANGE_WITH_SURCHARGE': return 'Obmen + doplata';
    case 'BOTH':                    return 'Obmen yoki obmen + doplata';
    case 'NONE':                    return "Yo'q";
    default:                        return '—';
  }
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-card sm:p-4">
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-bold uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-1 text-xl font-black leading-none text-foreground sm:text-2xl">{value}</div>
    </div>
  );
}

function AttributeTable({
  division,
  teamStrength,
  androidCoins,
  iosCoins,
  hasGooglePlayLink,
  hasGameCenterLink,
  exchangeMode,
  priceNegotiable,
}: {
  division?: number;
  teamStrength?: number;
  androidCoins: number;
  iosCoins: number;
  hasGooglePlayLink: boolean;
  hasGameCenterLink: boolean;
  exchangeMode?: string;
  priceNegotiable: boolean;
}) {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Eng yuqori Division', value: division === undefined ? '—' : String(division) },
    { label: 'Team Strength', value: teamStrength === undefined ? '—' : formatCompactNumber(teamStrength) },
    { label: 'Google Play ulangan', value: hasGooglePlayLink ? 'Ha' : "Yo'q" },
    { label: 'Game Center ulangan', value: hasGameCenterLink ? 'Ha' : "Yo'q" },
  ];
  if (hasGooglePlayLink) {
    rows.push({ label: 'Android coin', value: formatCompactNumber(androidCoins) });
  }
  if (hasGameCenterLink) {
    rows.push({ label: 'iOS coin', value: formatCompactNumber(iosCoins) });
  }
  rows.push({ label: 'Obmen', value: exchangeModeLabel(exchangeMode) });
  rows.push({ label: 'Savdolashish', value: priceNegotiable ? 'Mumkin' : "Yo'q" });

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-6">
      <h2 className="text-sm font-bold text-foreground">Xususiyatlar</h2>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4 border-b border-dashed border-border py-2 text-sm"
          >
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="font-semibold text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
