import { formatPriceUZS } from './marketplace-format';

interface PlatformListing {
  attributes?: Record<string, unknown>;
}

export function canUseSmartAdmin(listing: PlatformListing | null | undefined): boolean {
  return listing?.attributes?.platform === 'MOBILE';
}

/** A chat can be reused for different accounts, so only use matching listing data. */
export function resolveTradeListing<T extends { id: string }, U extends { id: string }>(
  request: { listingId: string; listing: T | null } | null,
  listing: U | null,
): T | U | null {
  if (!request) return listing;
  return request.listing ?? (listing?.id === request.listingId ? listing : null);
}

export function tradePlatformLabel(platform: unknown): string {
  if (platform === 'STEAM') return 'Steam';
  if (platform === 'PLAYSTATION' || platform === 'PS') return 'PlayStation';
  if (platform === 'MOBILE') return 'Mobile';
  return 'Platformasi aniqlanmagan akkount';
}

export function tradeAdminSupportHref({ chatId, listingId, platform, amountUzs }: {
  chatId: string;
  listingId?: string | null;
  platform: unknown;
  amountUzs?: number;
}): string {
  const message = [
    `${tradePlatformLabel(platform)} akkount savdosi uchun admin yordami kerak.`,
    listingId ? `E'lon: /marketplace/${encodeURIComponent(listingId)}` : null,
    `Xaridor va sotuvchi chati: /chats/${encodeURIComponent(chatId)}`,
    amountUzs != null && Number.isFinite(amountUzs) && amountUzs > 0
      ? `Taklif narxi: ${formatPriceUZS(amountUzs)}`
      : 'Kelishilgan narx yoki almashish shartlari: ',
    'Iltimos, kelishuvni ikkala tomon bilan tekshirib, akkountni topshirish va to‘lov tartibini tushuntiring.',
  ].filter(Boolean).join('\n');
  return `/support?${new URLSearchParams({ category: 'SUPPORT', message })}`;
}
