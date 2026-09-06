import { describe, expect, it } from 'vitest';

import { listingAdvertisingHref, parseAdvertisingChannels } from './listing-advertising';

describe('listing advertising destinations', () => {
  it('preserves unique selected channel IDs as repeated parameters', () => {
    expect(listingAdvertisingHref('listing-1', ['channel-1', 'channel-2', 'channel-1']))
      .toBe('/marketplace/listing-1/advertise?channel=channel-1&channel=channel-2');
    expect(listingAdvertisingHref('listing-1')).toBe('/marketplace/listing-1/advertise');
  });

  it('encodes listing IDs as one path segment', () => {
    expect(listingAdvertisingHref('a/b?from=elsewhere')).toBe('/marketplace/a%2Fb%3Ffrom%3Delsewhere/advertise');
  });

  it('accepts a single ID or repeated IDs and trims accidental surrounding spaces', () => {
    expect(parseAdvertisingChannels(undefined)).toEqual([]);
    expect(parseAdvertisingChannels('channel-1')).toEqual(['channel-1']);
    expect(parseAdvertisingChannels(['channel-1', ' channel-2 ', 'channel-1'])).toEqual(['channel-1', 'channel-2']);
  });

  it('drops malformed values and never carries prices or redirects into the destination', () => {
    expect(parseAdvertisingChannels(['', '../other', 'a&price=1', 'https://evil.test', 'id?from=/other', 'x'.repeat(65), 'valid_id']))
      .toEqual(['valid_id']);
    expect(listingAdvertisingHref('listing-1', ['a&price=1', 'valid_id'])).toBe('/marketplace/listing-1/advertise?channel=valid_id');
  });

  it('preserves the complete valid selection without silently dropping channels', () => {
    const ids = Array.from({ length: 100 }, (_, index) => `channel-${index}`);
    expect(parseAdvertisingChannels(ids)).toEqual(ids);
  });
});
