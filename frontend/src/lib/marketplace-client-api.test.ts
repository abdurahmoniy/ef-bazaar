import { describe, expect, it } from 'vitest';

import { buildMarketplaceApiPath } from './marketplace-client-api';

describe('marketplace client api helpers', () => {
  it('builds marketplace api urls against the same-origin route handler', () => {
    expect(buildMarketplaceApiPath('v1/listings')).toBe('/api/marketplace/v1/listings');
    expect(buildMarketplaceApiPath(['v1', 'listings', 'abc 123', 'like'])).toBe(
      '/api/marketplace/v1/listings/abc%20123/like',
    );
    expect(buildMarketplaceApiPath(['v1', 'chats'])).toBe('/api/marketplace/v1/chats');
    expect(
      buildMarketplaceApiPath('v1/listings', new URLSearchParams('page=1&sort=createdAt%2Cdesc')),
    ).toBe('/api/marketplace/v1/listings?page=1&sort=createdAt%2Cdesc');
  });

  it('supports overriding the base path (for tests / staging shims)', () => {
    expect(buildMarketplaceApiPath('v1/listings', undefined, '/api/staging-marketplace')).toBe(
      '/api/staging-marketplace/v1/listings',
    );
    expect(buildMarketplaceApiPath('v1/listings', undefined, '/api/staging-marketplace/')).toBe(
      '/api/staging-marketplace/v1/listings',
    );
  });

  it('rejects unsafe marketplace path segments', () => {
    expect(() => buildMarketplaceApiPath(['v1', '..', 'listings'])).toThrow('Invalid API path');
    expect(() => buildMarketplaceApiPath([])).toThrow('Invalid API path');
  });
});
