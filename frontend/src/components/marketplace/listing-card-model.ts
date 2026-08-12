import { formatListingDate, formatPriceUZS } from '@/lib/marketplace-format';
import {
  attributeCardList,
  attributeNumber,
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
  division?: number;
  teamStrength?: number;
  androidCoins?: number;
  iosCoins?: number;
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

  const googleLink = booleanAttribute(listing.attributes.has_google_play_link);
  const gameCenterLink = booleanAttribute(listing.attributes.has_game_center_link);
  const transferLimit = attributeNumber(listing, 'device_transfer_limit');
  const risks = Number(googleLink === true)
    + Number(gameCenterLink === true)
    + Number(transferLimit !== undefined && transferLimit <= 3);
  const allSafetyKnown = googleLink !== undefined
    && gameCenterLink !== undefined
    && transferLimit !== undefined;

  return {
    title: listing.description.split('\n')[0]?.trim() || 'eFootball akkount',
    price: formatPriceUZS(listing.price),
    date: formatListingDate(listing.createdAt),
    sold: listing.status === 'SOLD',
    negotiable: listing.priceNegotiable,
    exchange: listingAcceptsExchange(listing),
    division: attributeNumber(listing, 'highest_division_level'),
    teamStrength: attributeNumber(listing, 'team_strength'),
    androidCoins: attributeNumber(listing, 'android_coins'),
    iosCoins: attributeNumber(listing, 'ios_coins'),
    valuableCount: valuable.length,
    hasMetaCard: valuable.some((card) => card.metaTier === 'META'),
    matchLabel: details
      ? `${details.exactCount + details.alternateCount}/${details.selectedCount} mos · ${details.percent}%`
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
