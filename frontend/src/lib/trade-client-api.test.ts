import { describe, expect, it } from 'vitest';

import { buildTradeApiPath } from './trade-client-api';

describe('trade client api helpers', () => {
  it('builds same-origin trade api urls for browser fetches', () => {
    expect(buildTradeApiPath('v1/trade-admins')).toBe('/api/trade/v1/trade-admins');
    expect(buildTradeApiPath(['v1', 'trades', 'trade 123', 'actions', 'admin-accept'])).toBe(
      '/api/trade/v1/trades/trade%20123/actions/admin-accept',
    );
  });

  it('appends query params without changing encoded path segments', () => {
    const params = new URLSearchParams({ target: 'BUYER', q: 'Ali Vali' });

    expect(buildTradeApiPath(['v1', 'trades', 'trade 123', 'messages'], params)).toBe(
      '/api/trade/v1/trades/trade%20123/messages?target=BUYER&q=Ali+Vali',
    );
  });

  it('rejects unsafe path input', () => {
    expect(() => buildTradeApiPath([])).toThrow('Invalid API path');
    expect(() => buildTradeApiPath(['v1', '..', 'trades'])).toThrow('Invalid API path');
  });
});
