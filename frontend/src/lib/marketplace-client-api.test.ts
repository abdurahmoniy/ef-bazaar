import { describe, expect, it } from 'vitest';

import { buildMarketplaceApiPath } from './marketplace-client-api';

describe('marketplace client api helpers', () => {
  it('builds marketplace api urls on the api subdomain', () => {
    expect(buildMarketplaceApiPath('v1/listings')).toBe(
      'https://api.efbazaar.chempox.uz/api/v1/listings',
    );
    expect(buildMarketplaceApiPath(['v1', 'listings', 'abc 123', 'like'])).toBe(
      'https://api.efbazaar.chempox.uz/api/v1/listings/abc%20123/like',
    );
    expect(buildMarketplaceApiPath(['v1', 'cart', 'listing-1'])).toBe(
      'https://api.efbazaar.chempox.uz/api/v1/cart/listing-1',
    );
    expect(buildMarketplaceApiPath(['v1', 'chats'])).toBe(
      'https://api.efbazaar.chempox.uz/api/v1/chats',
    );
    expect(buildMarketplaceApiPath('v1/listings', new URLSearchParams('page=1&sort=createdAt%2Cdesc'))).toBe(
      'https://api.efbazaar.chempox.uz/api/v1/listings?page=1&sort=createdAt%2Cdesc',
    );
  });

  it('supports overriding the api base url', () => {
    expect(buildMarketplaceApiPath('v1/listings', undefined, 'https://staging.example.test/')).toBe(
      'https://staging.example.test/api/v1/listings',
    );
  });

  it('rejects unsafe marketplace path segments', () => {
    expect(() => buildMarketplaceApiPath(['v1', '..', 'listings'])).toThrow('Invalid API path');
    expect(() => buildMarketplaceApiPath([])).toThrow('Invalid API path');
  });
});
