import { afterEach, describe, expect, it, vi } from 'vitest';
import { accountTitle, fetchBusyAccountIds, givenSide, listingSide, receivedSide } from './swap-accounts';

describe('swap accounts', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('describes a chosen account from its snapshot', () => {
    const side = givenSide({ id: 'a', title: 'Asosiy akk', coverMessageId: 'm-1', summary: 'Kuchli', teamStrength: 3250 });
    expect(side).toMatchObject({ title: 'Asosiy akk', teamStrength: 3250, external: false });
    expect(side.coverUrl).toContain('m-1');
  });

  it('describes Other as an off-platform account', () => {
    expect(givenSide(null)).toEqual({ title: 'Platformadan tashqari akkount', coverUrl: null, teamStrength: null, external: true });
  });

  it('falls back to the summary when the account has no title', () => {
    expect(givenSide({ id: 'a', title: null, coverMessageId: null, summary: 'Kuchli akkount', teamStrength: null }).title).toBe('Kuchli akkount');
  });

  it('describes the listing side from its first line and cover', () => {
    const side = listingSide({ description: 'TS 3100 akk\nbatafsil', mediaMessageIds: ['m-9'], attributes: { team_strength: 3100 } });
    expect(side).toMatchObject({ title: 'TS 3100 akk', teamStrength: 3100, external: false });
    expect(side?.coverUrl).toContain('m-9');
  });

  it('shows each viewer what they receive', () => {
    const trade = { sellerId: 's', buyerId: 'b', giveAccount: { id: 'a', title: 'Asosiy akk', coverMessageId: null, summary: '', teamStrength: null } };
    const listing = listingSide({ description: 'E’lon akk', mediaMessageIds: [] });
    expect(receivedSide(trade, 's', listing)?.title).toBe('Asosiy akk');
    expect(receivedSide(trade, 'b', listing)?.title).toBe('E’lon akk');
    expect(receivedSide(trade, 'x', listing)).toBeNull();
  });

  it('names untitled accounts by their description', () => {
    expect(accountTitle({ title: '  ', description: 'Birinchi qator\nikkinchi' })).toBe('Birinchi qator');
    expect(accountTitle({ title: null, description: null })).toBe('Nomsiz akkount');
  });

  it('reads busy account ids and tolerates failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(['a', 'b'])));
    expect(await fetchBusyAccountIds()).toEqual(new Set(['a', 'b']));
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe('/api/trade/v1/trades/busy-accounts');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 502 })));
    expect(await fetchBusyAccountIds()).toEqual(new Set());
  });
});
