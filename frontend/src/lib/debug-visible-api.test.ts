import { describe, expect, it } from 'vitest';

import {
  buildDebugMarketplaceApiPath,
  buildInternalMarketplaceApiUrl,
  isDebugVisibleApiEnabled,
} from './debug-visible-api';

describe('debug visible api helpers', () => {
  it('parses explicit debug flags', () => {
    expect(isDebugVisibleApiEnabled({ DEBUG_VISIBLE_API: '1' })).toBe(true);
    expect(isDebugVisibleApiEnabled({ DEBUG_VISIBLE_API: 'true' })).toBe(true);
    expect(isDebugVisibleApiEnabled({ DEBUG_VISIBLE_API: 'yes' })).toBe(true);
    expect(isDebugVisibleApiEnabled({ DEBUG_VISIBLE_API: '0' })).toBe(false);
    expect(isDebugVisibleApiEnabled({})).toBe(false);
  });

  it('builds the browser-visible marketplace debug path', () => {
    expect(buildDebugMarketplaceApiPath('v1/listings')).toBe('/api/debug/marketplace/v1/listings');
    expect(buildDebugMarketplaceApiPath(['v1', 'listings', 'abc 123'])).toBe(
      '/api/debug/marketplace/v1/listings/abc%20123',
    );
  });

  it('builds the internal marketplace upstream url', () => {
    expect(
      buildInternalMarketplaceApiUrl(['v1', 'listings'], '?page=1', 'http://nginx:8080/api/'),
    ).toBe('http://nginx:8080/api/marketplace/v1/listings?page=1');
  });

  it('rejects unsafe marketplace path segments', () => {
    expect(() => buildDebugMarketplaceApiPath(['v1', '..', 'listings'])).toThrow('Invalid API path');
    expect(() => buildInternalMarketplaceApiUrl([])).toThrow('Invalid API path');
  });
});
