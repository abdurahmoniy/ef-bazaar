'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  PlayerFilterDialog,
  type PlayerMatchSelection,
} from '@/components/marketplace/player-filter-dialog';
import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';
import type { DreamTeam } from '@/lib/marketplace-types';
import { parsePlayerMatchValues, writePlayerMatch } from '@/lib/player-match-query';

interface PlayerFilterLauncherProps {
  /** Current browse query string, so applying a squad keeps every other filter. */
  currentQuery: string;
  activeMatchCards?: string[];
  activeMinMatch?: number;
}

/**
 * Client shell for {@link PlayerFilterDialog}: owns the URL rewrite and lazily
 * loads the user's saved squads.
 *
 * Teams are fetched here rather than passed down from the page so the server
 * component tree stays unchanged — signed-out visitors simply get an empty
 * list and the META/search tabs still work.
 */
export function PlayerFilterLauncher({
  currentQuery,
  activeMatchCards = [],
  activeMinMatch = 4,
}: PlayerFilterLauncherProps) {
  const router = useRouter();
  const [teams, setTeams] = useState<DreamTeam[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(buildMarketplaceApiPath(['v1', 'dream-teams']), {
      headers: { Accept: 'application/json' },
      credentials: 'include',
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : []))
      .then((payload) => setTeams(Array.isArray(payload) ? (payload as DreamTeam[]) : []))
      .catch(() => setTeams([]));
    return () => controller.abort();
  }, []);

  const active = parsePlayerMatchValues(activeMatchCards, String(activeMinMatch));

  function apply(cards: PlayerMatchSelection[] | undefined, strictness: number) {
    const criteria = cards?.flatMap((card) => card.playerId ? [{
      efhubId: card.efhubId,
      playerId: card.playerId,
      importance: card.priority ? 'P' as const : 'N' as const,
      name: card.name,
    }] : []);
    const params = writePlayerMatch(new URLSearchParams(currentQuery), criteria?.length
      ? { criteria, strictness }
      : undefined);
    const qs = params.toString();
    if (criteria?.length) {
      // Buyer intent is informational only. Fire-and-forget so Redis/network
      // issues can never delay applying the marketplace filter.
      void fetch(buildMarketplaceApiPath(['v1', 'card-interest', 'apply']), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        keepalive: true,
        body: JSON.stringify({
          efhubIds: criteria.map((criterion) => criterion.efhubId),
          anonymousToken: interestToken(),
        }),
      }).catch(() => undefined);
    }
    router.push(qs ? `/marketplace?${qs}` : '/marketplace');
  }

  return (
    <PlayerFilterDialog
      teams={teams}
      selected={active.criteria.map((criterion) => ({
        efhubId: criterion.efhubId,
        playerId: criterion.playerId,
        name: `Karta #${criterion.efhubId}`,
        priority: criterion.importance === 'P',
      }))}
      activeMinMatch={activeMinMatch}
      onApply={apply}
      activeCount={active.criteria.length}
    />
  );
}

const INTEREST_TOKEN_KEY = 'efbazaar:card-interest-token:v1';

function interestToken(): string {
  try {
    const existing = window.localStorage.getItem(INTEREST_TOKEN_KEY);
    if (existing) return existing;
    const created = window.crypto.randomUUID();
    window.localStorage.setItem(INTEREST_TOKEN_KEY, created);
    return created;
  } catch {
    return window.crypto.randomUUID();
  }
}
