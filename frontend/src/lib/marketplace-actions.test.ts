import { afterEach, describe, expect, it, vi } from 'vitest';

import { adminMarkListingSold, relistListing, saveDreamTeam } from './marketplace-actions';

describe('relistListing', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts to the owner relist endpoint with authentication', async () => {
    const data = { id: 'listing-1', status: 'ACTIVE' };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await relistListing('listing-1')).toEqual({ ok: true, data });
    expect(fetchMock).toHaveBeenCalledWith('/api/marketplace/v1/listings/listing-1/relist',
      expect.objectContaining({ method: 'POST', credentials: 'include' }));
  });

  it('returns backend validation errors to the owner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'listing_not_sold', message: "Faqat sotilgan e'lonni qayta sotuvga qo'yish mumkin",
    }), { status: 409 })));

    expect(await relistListing('listing-1')).toEqual({
      ok: false, status: 409, code: 'listing_not_sold',
      message: "Faqat sotilgan e'lonni qayta sotuvga qo'yish mumkin",
    });
  });

  it.each([
    ['telegram_required', 'Davom etish uchun Telegram akkauntingizni ulang.'],
    ['user_blacklisted', "Akkauntingiz qora ro'yxatda — bu amal bloklangan"],
  ])('preserves the actionable %s rejection', async (code, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code, message }), { status: 403 })));
    expect(await relistListing('listing-1')).toEqual({ ok: false, status: 403, code, message });
  });

  it('still asks an unauthenticated seller to sign in', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    expect(await relistListing('listing-1')).toMatchObject({ ok: false, status: 401, message: 'Kirish talab qilinadi' });
  });
});

describe('saveDreamTeam', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('upserts the authenticated users singleton team', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'team-1',
      name: 'Mening jamoam',
      formation: '4-3-3',
      slots: [],
      createdAt: '2026-08-11T00:00:00Z',
      updatedAt: '2026-08-11T00:00:00Z',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await saveDreamTeam({
      name: 'Mening jamoam',
      formation: '4-3-3',
      slots: [],
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/marketplace/v1/dream-teams/me', expect.objectContaining({
      method: 'PUT',
      credentials: 'include',
    }));
  });
});

describe('adminMarkListingSold', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the authenticated admin endpoint to mark a listing sold', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'listing-1', status: 'SOLD' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await adminMarkListingSold('listing-1')).toEqual({ ok: true, data: { id: 'listing-1', status: 'SOLD' } });
    expect(fetchMock).toHaveBeenCalledWith('/api/marketplace/v1/admin/listings/listing-1/sold', expect.objectContaining({
      method: 'POST', credentials: 'include',
    }));
  });
});
