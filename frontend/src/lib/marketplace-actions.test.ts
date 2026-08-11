import { afterEach, describe, expect, it, vi } from 'vitest';

import { saveDreamTeam } from './marketplace-actions';

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
