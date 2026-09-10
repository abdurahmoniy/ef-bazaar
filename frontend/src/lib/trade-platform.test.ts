import { describe, expect, it } from 'vitest';
import { canUseSmartAdmin, resolveTradeListing, tradeAdminSupportHref } from './trade-platform';

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

  it('prepares an editable admin request with trade references and the agreed amount', () => {
    const href = tradeAdminSupportHref({ chatId: 'chat-1', listingId: 'listing-2', platform: 'STEAM', amountUzs: 250000 });
    const url = new URL(href, 'https://efbazaar.uz');
    expect(url.pathname).toBe('/support');
    expect(url.searchParams.get('category')).toBe('SUPPORT');
    const draft = url.searchParams.get('message')!;
    expect(draft).toContain('Steam');
    expect(draft).toContain('/marketplace/listing-2');
    expect(draft).toContain('/chats/chat-1');
    expect(draft).toContain('250');
  });
});
