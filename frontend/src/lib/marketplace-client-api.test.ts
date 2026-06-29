import { describe, expect, it } from 'vitest';

import { buildMarketplaceApiPath } from './marketplace-client-api';

describe('marketplace client api helpers', () => {
  it('builds same-origin marketplace api paths visible in browser network tools', () => {
    expect(buildMarketplaceApiPath('v1/listings')).toBe('/api/marketplace/v1/listings');
    expect(buildMarketplaceApiPath(['v1', 'listings', 'abc 123', 'like'])).toBe(
      '/api/marketplace/v1/listings/abc%20123/like',
    );
    expect(buildMarketplaceApiPath('v1/listings', new URLSearchParams('page=1&sort=createdAt%2Cdesc'))).toBe(
      '/api/marketplace/v1/listings?page=1&sort=createdAt%2Cdesc',
    );
  });

  it('rejects unsafe marketplace path segments', () => {
    expect(() => buildMarketplaceApiPath(['v1', '..', 'listings'])).toThrow('Invalid API path');
    expect(() => buildMarketplaceApiPath([])).toThrow('Invalid API path');
  });
});
