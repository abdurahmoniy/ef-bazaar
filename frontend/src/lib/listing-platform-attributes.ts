const MOBILE_ATTRIBUTE_KEYS = new Set([
  'has_google_play_link',
  'has_game_center_link',
  'android_coins',
  'ios_coins',
  'device_transfer_limit',
]);

/** Listings predating the platform field were Mobile accounts. */
export function isMobileListingPlatform(platform: unknown): boolean {
  return !['STEAM', 'PLAYSTATION', 'PS'].includes(String(platform ?? '').trim().toUpperCase());
}

export function isListingAttributeApplicable(key: string, platform: unknown): boolean {
  const mobile = isMobileListingPlatform(platform);
  if (MOBILE_ATTRIBUTE_KEYS.has(key)) return mobile;
  if (key === 'coins') return !mobile;
  return true;
}

export function filterListingPlatformAttributes<T>(attributes: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(attributes).filter(([key]) =>
    isListingAttributeApplicable(key, attributes.platform),
  ));
}
