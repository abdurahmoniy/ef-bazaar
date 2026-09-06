import { describe, expect, it } from 'vitest';
import { listingShareUrl, telegramListingShareUrl } from './listing-share';

describe('contextual listing invitations', () => {
  it('shares the listing, not the current filters or partner campaign', () => {
    expect(listingShareUrl('https://efbazaar.uz', 'listing-1', 'ABCD1234'))
      .toBe('https://efbazaar.uz/marketplace/listing-1?ref=ABCD1234');
    expect(listingShareUrl('https://efbazaar.uz', 'listing-1')).toBe('https://efbazaar.uz/marketplace/listing-1');
  });
  it('encodes the path and ignores malformed referral codes', () => {
    expect(listingShareUrl('https://efbazaar.uz', 'a/b', 'bad&code')).toBe('https://efbazaar.uz/marketplace/a%2Fb');
  });
  it('preserves Uzbek text and the complete referral destination in Telegram sharing', () => {
    const target = listingShareUrl('https://efbazaar.uz', 'listing-1', 'ABCD1234');
    const share = new URL(telegramListingShareUrl(target, 'Messi & Mbappe — zo‘r!'));
    expect(share.searchParams.get('url')).toBe(target);
    expect(share.searchParams.get('text')).toContain('Messi & Mbappe — zo‘r!');
  });
});
