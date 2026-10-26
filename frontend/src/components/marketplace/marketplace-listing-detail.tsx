import { PopupTriggerSignal } from '@/components/popups/popup-trigger';
import Link from 'next/link';
import Image from 'next/image';
import { CompletionNotice } from './completion-notice';
import { Button } from '@/components/ui/button';
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
import { isMobileListingPlatform } from '@/lib/listing-platform-attributes';
import {
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
  buyerPreview?: boolean;
  completion?: 'created' | 'published';
}

export function MarketplaceListingDetail({
  listing,
  viewer,
  seller,
  sellerBlacklisted,
  sellerRatingSummary,
  similarListings,
  buyerPreview = false,
  completion,
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
  const isMobile = isMobileListingPlatform(listing.attributes.platform);
  // A store link (Google Play / Game Center) can't be removed, so the previous
  // owner keeps a way back into a transferred account — surface it as a caution.
  const hasGooglePlayLink = isMobile ? explicitLinkStatus(listing.attributes.has_google_play_link) : undefined;
  const hasGameCenterLink = isMobile ? explicitLinkStatus(listing.attributes.has_game_center_link) : undefined;
  const linkedStores = [
    hasGooglePlayLink && 'Google Play',
    hasGameCenterLink && 'Game Center',
  ]
    .filter(Boolean)
    .join(' va ');
  // eFootball caps "transfer data to new device" at 10 sign-ins per month and
  // a handover burns at least two (moderator check + buyer). A listing sitting
  // near the floor can stall mid-trade, so the count is buyer-facing.
  const deviceTransferLimit = isMobile ? attributeNumber(listing, 'device_transfer_limit') : undefined;
  const transferLimitTight =
    deviceTransferLimit !== undefined && deviceTransferLimit <= 3;
  const androidCoins = isMobile ? attributeNumber(listing, 'android_coins') : undefined;
  const iosCoins = isMobile ? attributeNumber(listing, 'ios_coins') : undefined;
  const coins = isMobile ? undefined : attributeNumber(listing, 'coins');
  const exchangeMode = attributeString(listing, 'exchange_mode');
  const acceptsExchange = listingAcceptsExchange(listing);
  const playersCount = attributeNumber(listing, 'players_count');
  const valuablePlayers = attributeCardList(listing, 'valuable_players');
  const authenticated = viewer !== null;
  const isOwner = viewer?.id === listing.sellerId;
  const ownerView = isOwner && !buyerPreview;

  const summary = (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {ownerView && mediaUrls[0] ? (
            <Image src={mediaUrls[0]} alt="" width={72} height={72} className="h-[72px] w-[72px] shrink-0 rounded-xl border border-border object-cover" />
          ) : divisionBadgeLevel && (
            <DivisionBadge level={divisionBadgeLevel} size={54} glow />
          )}
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-primary">
              {divisionLabel(division)}
            </p>
            <h1 className="mt-1 line-clamp-3 text-lg font-bold leading-tight text-foreground sm:text-xl sm:font-black break-words">
              {title}
            </h1>
            {/* On phones the price card is replaced by the sticky action
                bar, so the price still needs an in-flow home here. */}
            <p className={cn("mt-1 text-2xl font-black leading-none text-[hsl(var(--price))]", !ownerView && "lg:hidden")}>
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
          {ownerView && listing.status === 'ACTIVE' && <Badge variant="outline">Bozorda</Badge>}
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
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-warning-border bg-warning-soft p-3 text-xs leading-5 text-warning">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Bu akkount {linkedStores} bilan ulangan. Bu ulanishni uzib
            bo'lmaydi — akkount faqat Konami ID orqali o'tkaziladi va
            avvalgi egasida kirish imkoni saqlanib qolishi mumkin.
          </span>
        </p>
      )}

      {transferLimitTight && (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-warning-border bg-warning-soft p-3 text-xs leading-5 text-warning">
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
  );

  return (
    <article className="space-y-4">
      {ownerView && listing.status === 'ACTIVE' && completion && <PopupTriggerSignal trigger="LISTING_PUBLISHED" eventKey={listing.id} userId={viewer!.id} />}
      {ownerView && <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-muted-foreground">Sizning e’loningiz</p>
        <Button asChild variant="outline" className="min-h-11"><Link href={`/seller-tools?listingId=${encodeURIComponent(listing.id)}`}>Shaxsiy qaydlar va amallar</Link></Button>
        <Button asChild variant="outline" className="min-h-11"><Link href={`/marketplace/${listing.id}?view=buyer`}>Xaridor ko‘rinishi</Link></Button>
      </div>}
      {isOwner && buyerPreview && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted p-3">
        <p className="text-sm">Xaridor ko‘rinishi · amallar o‘chirilgan</p>
        <Button asChild variant="outline" className="min-h-11"><Link href={`/marketplace/${listing.id}`}>Boshqarishga qaytish</Link></Button>
      </div>}
      {ownerView && listing.status === 'ACTIVE' && completion && <CompletionNotice
        title={completion === 'published' ? 'Akkount bozorga chiqarildi' : 'E’lon joylandi'}
        description="Xaridorlar endi e’loningizni ko‘rishi mumkin. Xabarlar Chatlar bo‘limiga keladi.">
        <Button asChild className="min-h-11"><Link href={`/marketplace/${listing.id}?view=buyer`}>E’lonni ko‘rish</Link></Button>
      </CompletionNotice>}
      {!isOwner && <div className="flex justify-end">
        <ShareListingButton listingId={listing.id} title={title} authenticated={authenticated} />
      </div>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6">
        <div className="min-w-0 space-y-4">
          {ownerView && summary}
          {ownerView && listing.status === 'ACTIVE' && <ListingAdvertisingCard listingId={listing.id} />}
          <ListingMediaGallery title={title} urls={mediaUrls} />

          <MatchBreakdown listing={listing} />

          {!ownerView && summary}

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
              label={isMobile ? 'Coins' : 'Coin balansi'}
              value={isMobile
                ? formatCompactNumber((androidCoins ?? 0) + (iosCoins ?? 0))
                : coins === undefined ? '—' : formatCompactNumber(coins)}
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

          {!ownerView && <p className="text-xs leading-relaxed text-muted-foreground">Sotuvchi taqdim etgan ma’lumotlar. Ulanish holati mustaqil tekshiruv yoki kafolat emas.</p>}
          <AttributeTable
            isMobile={isMobile}
            division={division}
            teamStrength={teamStrength}
            playersCount={playersCount}
            androidCoins={androidCoins}
            iosCoins={iosCoins}
            coins={coins}
            hasGooglePlayLink={hasGooglePlayLink}
            hasGameCenterLink={hasGameCenterLink}
            exchangeMode={exchangeMode}
            priceNegotiable={listing.priceNegotiable}
          />

          {!ownerView && (canUseSmartAdmin(listing) ? (
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
          ))}
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
              listingTitle={title}
              buyerPreview={isOwner && buyerPreview}
              authenticated={authenticated}
              telegramLinked={viewer?.telegramLinked ?? false}
              botUsername={(process.env.NEXT_PUBLIC_TELEGRAM_BOT ?? process.env.TELEGRAM_BOT_USERNAME ?? '').replace('@', '')}
              isOwner={isOwner}
              initialLiked={listing.likedByMe}
              initialLikeCount={listing.likeCount}
              status={listing.status}
            />
          </div>

          {!ownerView && <SellerCard
            seller={seller}
            isViewerOwner={isOwner}
            listingStatus={listing.status}
            blacklisted={sellerBlacklisted}
            ratingSummary={sellerRatingSummary}
          />}
        </aside>
      </div>

      {!ownerView && similarListings.length > 0 && (
        <section className="pt-4">
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-lg font-bold text-foreground">O'xshash e'lonlar</h2>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
            {similarListings.slice(0, 4).map((entry) => (
              <ListingCard key={entry.id} listing={entry} readOnly={isOwner && buyerPreview} />
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
  isMobile,
  division,
  teamStrength,
  playersCount,
  androidCoins,
  iosCoins,
  coins,
  hasGooglePlayLink,
  hasGameCenterLink,
  exchangeMode,
  priceNegotiable,
}: {
  isMobile: boolean;
  division?: number;
  teamStrength?: number;
  playersCount?: number;
  androidCoins?: number;
  iosCoins?: number;
  coins?: number;
  hasGooglePlayLink?: boolean;
  hasGameCenterLink?: boolean;
  exchangeMode?: string;
  priceNegotiable: boolean;
}) {
  const rows: Array<{ label: string; value: string; negative?: boolean }> = [
    { label: 'Eng yuqori Division', value: division === undefined ? '—' : divisionLabel(division) },
    { label: 'Team Strength', value: teamStrength === undefined ? '—' : formatCompactNumber(teamStrength) },
    { label: "Jami o'yinchilar", value: playersCount === undefined ? '—' : formatCompactNumber(playersCount) },
  ];
  if (isMobile) {
    rows.push(
      { label: 'Google Play ulangan', value: hasGooglePlayLink === undefined ? 'Noma’lum' : hasGooglePlayLink ? 'Ha' : "Yo'q" },
      { label: 'Game Center ulangan', value: hasGameCenterLink === undefined ? 'Noma’lum' : hasGameCenterLink ? 'Ha' : "Yo'q" },
    );
  }
  if (coins !== undefined) {
    rows.push({
      label: 'Coin balansi',
      value: formatCompactNumber(coins),
      negative: coins < 0,
    });
  }
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

function explicitLinkStatus(value: unknown): boolean | undefined {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return undefined;
}
