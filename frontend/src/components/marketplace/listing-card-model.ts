import { formatListingDate, formatPriceUZS } from '@/lib/marketplace-format';
import { isMobileListingPlatform } from '@/lib/listing-platform-attributes';
import {
  attributeCardList,
  attributeNumber,
  attributeString,
  listingAcceptsExchange,
  type ListingResponse,
} from '@/lib/marketplace-types';
import type { PlayerMatchCriterion } from '@/lib/player-match-query';

export interface ListingCardModel {
  title: string;
  price: string;
  date: string;
  sold: boolean;
  negotiable: boolean;
  exchange: boolean;
  exchangeLabel: string | null;
  googlePlayLinked: boolean;
  gameCenterLinked: boolean;
  clean: boolean;
  division?: number;
  teamStrength?: number;
  androidCoins?: number;
  iosCoins?: number;
  coins?: number;
  valuableCount: number;
  hasMetaCard: boolean;
  matchLabel: string | null;
  playerNames: string[];
  playerRemainder: number;
  safety: {
    tone: 'warning' | 'safe';
    label: string;
  } | null;
}

function booleanAttribute(value: unknown) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return undefined;
}

function exchangeLabel(listing: ListingResponse): string | null {
  switch (attributeString(listing, 'exchange_mode')) {
    case 'NONE':
      return null;
    case 'EXCHANGE_ONLY':
      return 'Faqat obmen';
    case 'EXCHANGE_WITH_SURCHARGE':
      return 'Obmen + doplata';
    case 'BOTH':
      return 'Obmen yoki obmen + doplata';
    default:
      return null;
  }
}

function nonZeroNumberAttribute(listing: ListingResponse, key: string) {
  const value = attributeNumber(listing, key);
  return value !== undefined && value !== 0 ? value : undefined;
}

/**
 * Derive every piece of buyer-facing card copy once so horizontal, vertical,
 * and automatic layouts cannot drift semantically.
 */
export function buildListingCardModel(
  listing: ListingResponse,
  criteria: PlayerMatchCriterion[],
): ListingCardModel {
  const valuable = attributeCardList(listing, 'valuable_players');
  const details = listing.matchDetails;
  const exactIds = new Set(details?.exactEfhubIds ?? []);
  const alternateWantedIds = new Set(details?.alternateEfhubIds ?? []);
  const alternatePlayerIds = new Set(
    criteria
      .filter((criterion) => alternateWantedIds.has(criterion.efhubId))
      .map((criterion) => criterion.playerId.toLowerCase()),
  );

  const annotated = valuable.map((card) => ({
    card,
    matched: exactIds.has(card.efhubId)
      || Boolean(card.playerId && alternatePlayerIds.has(card.playerId.toLowerCase())),
  }));
  const orderedPlayers = details
    ? [
        ...annotated.filter((entry) => entry.matched),
        ...annotated.filter((entry) => !entry.matched),
      ]
    : annotated;
  const names = orderedPlayers
    .map(({ card }) => card.name.trim())
    .filter(Boolean);

  const isMobile = isMobileListingPlatform(listing.attributes.platform);
  const googleLink = isMobile ? booleanAttribute(listing.attributes.has_google_play_link) : undefined;
  const gameCenterLink = isMobile ? booleanAttribute(listing.attributes.has_game_center_link) : undefined;
  const transferLimit = isMobile ? attributeNumber(listing, 'device_transfer_limit') : undefined;
  const risks = Number(googleLink === true)
    + Number(gameCenterLink === true)
    + Number(transferLimit !== undefined && transferLimit <= 3);
  const allSafetyKnown = googleLink !== undefined
    && gameCenterLink !== undefined
    && transferLimit !== undefined;

  const androidCoins = isMobile ? nonZeroNumberAttribute(listing, 'android_coins') : undefined;
  const iosCoins = isMobile ? nonZeroNumberAttribute(listing, 'ios_coins') : undefined;
  const googlePlayLinked = isMobile && listing.attributes.has_google_play_link === true;
  const gameCenterLinked = isMobile && listing.attributes.has_game_center_link === true;
  const hasNegativeCoins =
    (androidCoins !== undefined && androidCoins < 0) ||
    (iosCoins !== undefined && iosCoins < 0);
  const clean = isMobile && googleLink === false && gameCenterLink === false && !hasNegativeCoins;

  return {
    title: listing.description.split('\n')[0]?.trim() || 'eFootball akkount',
    price: formatPriceUZS(listing.price),
    date: formatListingDate(listing.createdAt),
    sold: listing.status === 'SOLD',
    negotiable: listing.priceNegotiable,
    exchange: listingAcceptsExchange(listing),
    exchangeLabel: exchangeLabel(listing),
    googlePlayLinked,
    gameCenterLinked,
    clean,
    division: attributeNumber(listing, 'highest_division_level'),
    teamStrength: attributeNumber(listing, 'team_strength'),
    androidCoins,
    iosCoins,
    coins: isMobile ? undefined : attributeNumber(listing, 'coins'),
    valuableCount: valuable.length,
    hasMetaCard: valuable.some((card) => card.metaTier === 'META'),
    // Lentada profil 50 tagacha kriteriy — foiz ma'nosiz, shuning uchun faqat mos o'yinchilar soni.
    matchLabel: details
      ? listing.matchKind === 'feed'
        ? `${details.exactCount + details.alternateCount} ta o'yinchi mos`
        : `${details.exactCount + details.alternateCount}/${details.selectedCount} mos · ${details.percent}%`
      : typeof listing.matchPercent === 'number'
        ? `${listing.matchPercent}% mos`
        : null,
    playerNames: names.slice(0, 2),
    playerRemainder: Math.max(0, names.length - 2),
    safety: risks > 0
      ? { tone: 'warning', label: `${risks} ta transfer xavfi` }
      : allSafetyKnown && googleLink === false && gameCenterLink === false && transferLimit > 3
        ? { tone: 'safe', label: 'Transfer xavfsiz' }
        : null,
  };
}
