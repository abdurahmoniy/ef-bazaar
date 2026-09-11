import type { ListingResponse } from './marketplace-types';

const BOT_PHOTO_BASE_PATH =
  process.env.NEXT_PUBLIC_BOT_PHOTO_BASE_URL || 'https://efbazaar.uz/bot/photo';

export function listingMediaUrl(fileId: string) {
  const normalized = fileId.trim();
  if (!normalized) return null;
  return `${BOT_PHOTO_BASE_PATH}/${encodeURIComponent(normalized)}`;
}

export function listingMediaUrls(
  listing: Pick<ListingResponse, 'mediaMessageIds'>,
  limit = listing.mediaMessageIds.length,
) {
  return listing.mediaMessageIds
    .map(listingMediaUrl)
    .filter((url): url is string => Boolean(url))
    .slice(0, limit);
}
