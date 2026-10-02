'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  PlayerFilterDialog,
  type PlayerMatchSelection,
} from '@/components/marketplace/player-filter-dialog';
import { buildMarketplaceApiPath, REC_API_BASE } from '@/lib/marketplace-client-api';
import {
  mergeCachedPlayerSelections,
  parsePlayerFilterCache,
  PLAYER_FILTER_CACHE_KEY,
  serializePlayerFilterCache,
} from '@/lib/player-filter-cache';
import type { DreamTeam } from '@/lib/marketplace-types';
import { parsePlayerMatchValues, writePlayerMatch } from '@/lib/player-match-query';

interface PlayerFilterLauncherProps {
  /** Current browse query string, so applying a squad keeps every other filter. */
  currentQuery: string;
  activeMatchCards?: string[];
  activeMinMatch?: number;
  authenticated: boolean;
}

function isDreamTeam(value: unknown): value is DreamTeam {
  if (!value || typeof value !== 'object') return false;
  const team = value as Record<string, unknown>;
  return typeof team.id === 'string'
    && typeof team.name === 'string'
    && typeof team.formation === 'string'
    && typeof team.createdAt === 'string'
    && typeof team.updatedAt === 'string'
    && Array.isArray(team.slots)
    && team.slots.every((slot) => (
      Boolean(slot)
      && typeof slot === 'object'
      && Number.isSafeInteger((slot as Record<string, unknown>).index)
      && typeof (slot as Record<string, unknown>).position === 'string'
    ));
}

function firstDreamTeam(payload: unknown): DreamTeam | null {
  const values = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object'
      && Array.isArray((payload as { content?: unknown }).content)
      ? (payload as { content: unknown[] }).content
      : [];
  return values.find(isDreamTeam) ?? null;
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
  authenticated,
}: PlayerFilterLauncherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [teams, setTeams] = useState<DreamTeam[]>([]);
  const teamLoadStartedRef = useRef(false);
  const teamControllerRef = useRef<AbortController | null>(null);
  const active = useMemo(
    () => parsePlayerMatchValues(activeMatchCards, String(activeMinMatch)),
    [activeMatchCards, activeMinMatch],
  );
  const [selected, setSelected] = useState<PlayerMatchSelection[]>(
    () => mergeCachedPlayerSelections(active.criteria, []),
  );

  useEffect(() => {
    let cached: PlayerMatchSelection[] = [];
    try {
      cached = parsePlayerFilterCache(window.sessionStorage.getItem(PLAYER_FILTER_CACHE_KEY));
    } catch {
      // Storage can be blocked by the host browser; the public URL still works.
    }
    setSelected(mergeCachedPlayerSelections(active.criteria, cached));
  }, [active]);

  useEffect(() => () => teamControllerRef.current?.abort(), []);

  const changeOpen = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen && window.location.hash === '#marketplace-player-filter') {
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${window.location.search}`,
      );
    }
    if (!nextOpen || teamLoadStartedRef.current) return;

    teamLoadStartedRef.current = true;
    const controller = new AbortController();
    teamControllerRef.current = controller;
    fetch(buildMarketplaceApiPath(['v1', 'dream-teams'], undefined, REC_API_BASE), {
      headers: { Accept: 'application/json' },
      credentials: 'include',
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : []))
      .then((payload) => {
        if (!controller.signal.aborted) {
          const team = firstDreamTeam(payload);
          setTeams(team ? [team] : []);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted && (error as Error).name !== 'AbortError') setTeams([]);
      });
  }, []);

  useEffect(() => {
    const openFromHash = () => {
      if (window.location.hash === '#marketplace-player-filter') changeOpen(true);
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, [changeOpen]);

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
    try {
      window.sessionStorage.setItem(
        PLAYER_FILTER_CACHE_KEY,
        serializePlayerFilterCache(cards ?? []),
      );
    } catch {
      // Session snapshots are presentation-only; navigation must remain usable.
    }
    if (criteria?.length) {
      // Buyer intent is informational only. Fire-and-forget so Redis/network
      // issues can never delay applying the marketplace filter.
      void fetch(buildMarketplaceApiPath(['v1', 'card-interest', 'apply'], undefined, REC_API_BASE), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        keepalive: true,
        body: JSON.stringify({
          efhubIds: criteria.map((criterion) => criterion.efhubId),
        }),
      }).catch(() => undefined);
    }
    router.push(qs ? `/marketplace?${qs}` : '/marketplace');
  }

  return (
    <PlayerFilterDialog
      open={open}
      onOpenChange={changeOpen}
      teams={teams}
      authenticated={authenticated}
      selected={selected}
      activeMinMatch={activeMinMatch}
      onApply={apply}
      activeCount={active.criteria.length}
    />
  );
}
