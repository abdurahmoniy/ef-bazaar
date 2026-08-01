'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { PlayerFilterDialog } from '@/components/marketplace/player-filter-dialog';
import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';
import type { AttachedPlayerCard, DreamTeam } from '@/lib/marketplace-types';

interface PlayerFilterLauncherProps {
  /** Current browse query string, so applying a squad keeps every other filter. */
  currentQuery: string;
  /** Serialized dream team already applied, if any. */
  activeDreamTeam?: string;
  activeMinMatch?: number;
}

const DREAM_TEAM_PARAM = 'attr.dream_team';
const MIN_MATCH_PARAM = 'attr.dream_team_min_match';

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
  activeDreamTeam,
  activeMinMatch = 40,
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

  function apply(dreamTeam: string | undefined, minMatch: number) {
    const params = new URLSearchParams(currentQuery);
    if (dreamTeam) {
      params.set(DREAM_TEAM_PARAM, dreamTeam);
      params.set(MIN_MATCH_PARAM, String(minMatch));
    } else {
      params.delete(DREAM_TEAM_PARAM);
      params.delete(MIN_MATCH_PARAM);
    }
    // A new squad reorders everything — page 3 of the old result set is meaningless.
    params.delete('page');
    const qs = params.toString();
    router.push(qs ? `/marketplace?${qs}` : '/marketplace');
  }

  return (
    <PlayerFilterDialog
      teams={teams}
      selected={parseSelected(activeDreamTeam)}
      activeMinMatch={activeMinMatch}
      onApply={apply}
      activeCount={parseSelected(activeDreamTeam).length}
    />
  );
}

/**
 * Rebuild the picked cards from the filter payload so reopening the dialog
 * shows what is actually applied. Only id and name survive in the URL — enough
 * to keep selection state honest, images reload from the catalogue.
 */
function parseSelected(dreamTeam?: string): AttachedPlayerCard[] {
  if (!dreamTeam) return [];
  try {
    const parsed = JSON.parse(dreamTeam) as Array<{ id?: string; name?: string }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((slot) => slot?.id && slot?.name)
      .map((slot) => ({ efhubId: Number(slot.id), name: String(slot.name) }));
  } catch {
    return [];
  }
}
