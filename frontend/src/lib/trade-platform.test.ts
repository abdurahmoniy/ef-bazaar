import { describe, expect, it } from 'vitest';
import { canUseSmartAdmin, resolveTradeListing, tradeAdminTelegramHref } from './trade-platform';

describe('platform trade routing', () => {
  it('only enables Smart Admin for explicitly mobile listings', () => {
    expect(canUseSmartAdmin({ attributes: { platform: 'MOBILE' } })).toBe(true);
    for (const platform of ['STEAM', 'PLAYSTATION', 'PS', '', undefined]) {
      expect(canUseSmartAdmin({ attributes: { platform } })).toBe(false);
    }
    expect(canUseSmartAdmin(null)).toBe(false);
  });

  it('uses the selected account and never falls back to an unrelated chat listing', () => {
    const mobile = { id: 'mobile', attributes: { platform: 'MOBILE' } };
    const steam = { id: 'steam', attributes: { platform: 'STEAM' } };
    expect(resolveTradeListing({ listingId: 'steam', listing: steam }, mobile)).toBe(steam);
    expect(resolveTradeListing({ listingId: 'steam', listing: null }, mobile)).toBeNull();
    expect(resolveTradeListing({ listingId: 'mobile', listing: null }, mobile)).toBe(mobile);
    expect(resolveTradeListing(null, mobile)).toBe(mobile);
  });

  it('opens the named Telegram admin with a plain-text draft and an absolute listing link', () => {
    const href = tradeAdminTelegramHref({ listingId: 'listing-2', platform: 'STEAM', amountUzs: 250000 });
    const url = new URL(href, 'https://efbazaar.uz');
    expect(url.origin + url.pathname).toBe('https://t.me/abdurahmoniy');
    const draft = url.searchParams.get('text')!;
    expect(draft).toContain('Steam');
    expect(draft).toContain("E'lon: https://efbazaar.uz/marketplace/listing-2");
    expect(draft).not.toContain('/chats/');
    expect(draft).not.toContain('<a');
    expect(draft).not.toContain("[E'lon]");
    expect(draft).toContain('250');
  });
});
