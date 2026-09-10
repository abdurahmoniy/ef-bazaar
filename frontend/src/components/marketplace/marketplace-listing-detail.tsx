import { canUseSmartAdmin } from '@/lib/trade-platform';
import {
  ArrowLeftRight,
  Coins,
  Gamepad2,
  MapPin,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';

import { DivisionBadge, toDivisionLevel } from '@/components/marketplace/division-badge';
import { ListingActions } from '@/components/marketplace/listing-actions';
import { ListingAdvertisingCard } from '@/components/marketplace/listing-advertising-card';
import { ListingCard } from '@/components/marketplace/listing-card';
import { ListingMediaGallery } from '@/components/marketplace/listing-media-gallery';
import { ListingViewCount } from '@/components/marketplace/listing-view-count';
import { MatchBreakdown } from '@/components/marketplace/match-breakdown';
import { PlayerCardTile } from '@/components/marketplace/player-card-tile';
import { SellerCard } from '@/components/marketplace/seller-card';
import { ShareListingButton } from '@/components/marketplace/share-listing-button';
import { TipCallout } from '@/components/help/tip-callout';
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
  attributeCardList,
  attributeNumber,
  attributeString,
  listingAcceptsExchange,
  type ListingResponse,
  type SellerSummary,
} from '@/lib/marketplace-types';
import type { SellerRatingSummaryResponse } from '@/lib/trade-types';
import type { User } from '@/lib/types';
import { cn } from '@/lib/utils';

interface MarketplaceListingDetailProps {
  listing: ListingResponse;
  viewer: User | null;
  seller: SellerSummary | User | null;
  sellerBlacklisted?: boolean;
  sellerRatingSummary?: SellerRatingSummaryResponse | null;
  similarListings: ListingResponse[];
}

export function MarketplaceListingDetail({
  listing,
  viewer,
  seller,
  sellerBlacklisted,
  sellerRatingSummary,
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
  const divisionBadgeLevel = toDivisionLevel(division);
  const teamStrength = attributeNumber(listing, 'team_strength');
  // A store link (Google Play / Game Center) can't be removed, so the previous
  // owner keeps a way back into a transferred account — surface it as a caution.
  const hasGooglePlayLink = attributeBoolean(listing, 'has_google_play_link');
  const hasGameCenterLink = attributeBoolean(listing, 'has_game_center_link');
  const linkedStores = [
    hasGooglePlayLink && 'Google Play',
    hasGameCenterLink && 'Game Center',
  ]
    .filter(Boolean)
    .join(' va ');
  // eFootball caps "transfer data to new device" at 10 sign-ins per month and
  // a handover burns at least two (moderator check + buyer). A listing sitting
  // near the floor can stall mid-trade, so the count is buyer-facing.
  const deviceTransferLimit = attributeNumber(listing, 'device_transfer_limit');
  const transferLimitTight =
    deviceTransferLimit !== undefined && deviceTransferLimit <= 3;
  const androidCoins = attributeNumber(listing, 'android_coins');
  const iosCoins = attributeNumber(listing, 'ios_coins');
  const exchangeMode = attributeString(listing, 'exchange_mode');
  const acceptsExchange = listingAcceptsExchange(listing);
  const playersCount = attributeNumber(listing, 'players_count');
  const valuablePlayers = attributeCardList(listing, 'valuable_players');
  const authenticated = viewer !== null;
  const isOwner = viewer?.id === listing.sellerId;

  return (
    <article className="space-y-4">
      <div className="flex justify-end">
        <ShareListingButton listingId={listing.id} title={title} authenticated={authenticated} />
      </div>

      {isOwner && listing.status === 'ACTIVE' && <ListingAdvertisingCard listingId={listing.id} />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6">
        <div className="min-w-0 space-y-4">
          <ListingMediaGallery title={title} urls={mediaUrls} />

          <MatchBreakdown listing={listing} />

          <div className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                {divisionBadgeLevel && (
                  <DivisionBadge level={divisionBadgeLevel} size={54} glow />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-primary">
                    {divisionLabel(division)}
                  </p>
                  <h1 className="mt-1 line-clamp-3 text-lg font-bold leading-tight text-foreground sm:text-xl sm:font-black">
                    {title}
                  </h1>
                  {/* On phones the price card is replaced by the sticky action
                      bar, so the price still needs an in-flow home here. */}
                  <p className="mt-1 text-2xl font-black leading-none text-[hsl(var(--price))] lg:hidden">
                    {formatPriceUZS(listing.price)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatListingDate(listing.createdAt)} • ID: {listing.id.slice(0, 8)}
                  </p>
                  <ListingViewCount
                    listingId={listing.id}
                    initialCount={listing.viewCount ?? 0}
                    track={!isOwner && listing.status === 'ACTIVE'}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {listing.status === 'SOLD' && <Badge variant="danger">Sotilgan</Badge>}
                {listing.priceNegotiable && <Badge variant="price">Savdolashish</Badge>}
                {acceptsExchange && (
                  <Badge variant="info">
                    <ArrowLeftRight className="h-3 w-3" /> Obmen
                  </Badge>
                )}
                {deviceTransferLimit !== undefined && (
                  <Badge variant={transferLimitTight ? 'warn' : 'outline'}>
                    <Smartphone className="h-3 w-3" /> Qurilma limiti:{' '}
                    {deviceTransferLimit}/10
                  </Badge>
                )}
                {hasGooglePlayLink && (
                  <Badge variant="warn">
                    <TriangleAlert className="h-3 w-3" /> Google Play ulangan
                  </Badge>
                )}
                {hasGameCenterLink && (
                  <Badge variant="warn">
                    <TriangleAlert className="h-3 w-3" /> Game Center ulangan
                  </Badge>
                )}
              </div>
            </div>

            {linkedStores && (
              <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Bu akkount {linkedStores} bilan ulangan. Bu ulanishni uzib
                  bo'lmaydi — akkount faqat Konami ID orqali o'tkaziladi va
                  avvalgi egasida kirish imkoni saqlanib qolishi mumkin.
                </span>
              </p>
            )}

            {transferLimitTight && (
              <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Bu akkountda shu oy uchun {deviceTransferLimit} ta qurilma
                  almashtirish limiti qolgan. Savdo kamida 2 tasini oladi:
                  moderator tekshiruvi va sizning qurilmangizga kirish. Limit
                  keyingi oy yangilanadi.
                </span>
              </p>
            )}

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
            {divisionBadgeLevel ? (
              <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card p-3 shadow-card sm:p-4">
                <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  Division
                </span>
                <DivisionBadge level={divisionBadgeLevel} size={48} glow />
              </div>
            ) : (
              <StatCard
                icon={<ShieldCheck className="h-4 w-4" />}
                label="Division"
                value={division === undefined ? '—' : divisionLabel(division)}
              />
            )}
            <StatCard
              icon={<Gamepad2 className="h-4 w-4" />}
              label="Team strength"
              value={teamStrength === undefined ? '—' : formatCompactNumber(teamStrength)}
            />
            <StatCard
              icon={<Coins className="h-4 w-4" />}
              label="Coins"
              value={formatCompactNumber((androidCoins ?? 0) + (iosCoins ?? 0))}
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
            playersCount={playersCount}
            androidCoins={androidCoins}
            iosCoins={iosCoins}
            hasGooglePlayLink={hasGooglePlayLink}
            hasGameCenterLink={hasGameCenterLink}
            exchangeMode={exchangeMode}
            priceNegotiable={listing.priceNegotiable}
          />

          {canUseSmartAdmin(listing) ? (
            <TipCallout
              variant="security"
              dismissible
              dismissKey="listing_detail_escrow_security"
              learnMoreHref="/help#how-escrow-works"
              learnMoreLabel="Garov qanday ishlaydi?"
            >
              Xavfsiz xarid: Hech qachon to‘g‘ridan-to‘g‘ri karta orqali pul o‘tkazmang. Bitimni sotuvchi bilan chatda &quot;Garov&quot; ochish orqali amalga oshiring.
            </TipCallout>
          ) : (
            <TipCallout variant="security">
              Smart admin faqat Mobile uchun ishlaydi. Steam va PlayStation savdosida
              sotuvchi bilan narx va shartlarni chatda kelishib oling, so‘ng
              &quot;Adminga murojaat&quot; orqali akkountni topshirish va to‘lov tartibini kelishing.
            </TipCallout>
          )}
        </div>

        {/* Media leads on mobile; the price + CTA live in the sticky bottom bar
            there, so this panel is desktop-only. */}
        <aside className="min-w-0 flex flex-col gap-4 lg:sticky lg:top-32 lg:self-start">
          <div className="hidden rounded-xl border border-border bg-card p-4 shadow-card sm:p-5 lg:block">
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
              status={listing.status}
            />
          </div>

          <SellerCard
            seller={seller}
            isViewerOwner={isOwner}
            blacklisted={sellerBlacklisted}
            ratingSummary={sellerRatingSummary}
          />
        </aside>
      </div>

      {similarListings.length > 0 && (
        <section className="pt-4">
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-lg font-bold text-foreground">O'xshash e'lonlar</h2>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
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
  playersCount,
  androidCoins,
  iosCoins,
  hasGooglePlayLink,
  hasGameCenterLink,
  exchangeMode,
  priceNegotiable,
}: {
  division?: number;
  teamStrength?: number;
  playersCount?: number;
  androidCoins?: number;
  iosCoins?: number;
  hasGooglePlayLink: boolean;
  hasGameCenterLink: boolean;
  exchangeMode?: string;
  priceNegotiable: boolean;
}) {
  const rows: Array<{ label: string; value: string; negative?: boolean }> = [
    { label: 'Eng yuqori Division', value: division === undefined ? '—' : divisionLabel(division) },
    { label: 'Team Strength', value: teamStrength === undefined ? '—' : formatCompactNumber(teamStrength) },
    { label: "Jami o'yinchilar", value: playersCount === undefined ? '—' : formatCompactNumber(playersCount) },
    { label: 'Google Play ulangan', value: hasGooglePlayLink ? 'Ha' : "Yo'q" },
    { label: 'Game Center ulangan', value: hasGameCenterLink ? 'Ha' : "Yo'q" },
  ];
  if (androidCoins !== undefined) {
    rows.push({
      label: 'Android coin',
      value: formatCompactNumber(androidCoins),
      negative: androidCoins < 0,
    });
  }
  if (iosCoins !== undefined) {
    rows.push({
      label: 'iOS coin',
      value: formatCompactNumber(iosCoins),
      negative: iosCoins < 0,
    });
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
            <dd className={cn('font-semibold text-foreground', row.negative && 'text-destructive')}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
