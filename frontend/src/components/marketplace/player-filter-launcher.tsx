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
