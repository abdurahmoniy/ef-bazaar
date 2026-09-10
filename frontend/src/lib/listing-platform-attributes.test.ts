import { describe, expect, it } from 'vitest';
import { filterListingPlatformAttributes, isListingAttributeApplicable, isMobileListingPlatform } from './listing-platform-attributes';

const mobileKeys = ['has_google_play_link', 'has_game_center_link', 'android_coins', 'ios_coins', 'device_transfer_limit'];
describe('listing platform attributes', () => {
  it.each(['STEAM', 'PLAYSTATION'])('only uses general coins and shared attributes for %s', (platform) => {
    expect(isMobileListingPlatform(platform)).toBe(false);
    for (const key of mobileKeys) expect(isListingAttributeApplicable(key, platform)).toBe(false);
    expect(isListingAttributeApplicable('coins', platform)).toBe(true);
    expect(isListingAttributeApplicable('team_strength', platform)).toBe(true);
    expect(isListingAttributeApplicable('custom_global_boolean', platform)).toBe(true);
  });
  it('preserves Mobile attributes and supports legacy Mobile records', () => {
    for (const platform of ['MOBILE', undefined, 'Android', 'iOS']) {
      expect(isMobileListingPlatform(platform)).toBe(true);
      for (const key of mobileKeys) expect(isListingAttributeApplicable(key, platform)).toBe(true);
      expect(isListingAttributeApplicable('coins', platform)).toBe(false);
    }
  });
  it('clears hidden values on platform switches without modifying the source', () => {
    const attributes = { platform: 'STEAM', android_coins: -200, ios_coins: 300, has_google_play_link: true, has_game_center_link: false, device_transfer_limit: 1, coins: 900, team_strength: 3100 };
    expect(filterListingPlatformAttributes(attributes)).toEqual({ platform: 'STEAM', coins: 900, team_strength: 3100 });
    expect(attributes.android_coins).toBe(-200);
    expect(filterListingPlatformAttributes({ ...attributes, platform: 'MOBILE' })).not.toHaveProperty('coins');
  });
});
