import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';
import type { GamerCardResponse, GamerProfileUpdateRequest } from '@/lib/gamer-types';

/** Browser-side Gamer Card calls (profile edit + blacklist banner checks). */

export async function fetchMyGamerCard(): Promise<GamerCardResponse | null> {
  try {
    const res = await fetch(buildMarketplaceApiPath(['v1', 'gamer-cards', 'me']), {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as GamerCardResponse;
  } catch {
    return null;
  }
}

export async function updateMyGamerProfile(
  payload: GamerProfileUpdateRequest,
): Promise<GamerCardResponse | null> {
  try {
    const res = await fetch(buildMarketplaceApiPath(['v1', 'gamer-cards', 'me']), {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return (await res.json()) as GamerCardResponse;
  } catch {
    return null;
  }
}
