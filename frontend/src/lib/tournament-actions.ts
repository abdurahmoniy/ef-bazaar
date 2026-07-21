'use client';

import type { ActionResult } from './marketplace-actions';

/**
 * Browser-side turnir amallari — same-origin `/api/tournaments/*` proxy orqali
 * (Route Handler → internal nginx → chempionat-api, header-auth bilan).
 */

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function messageFrom(payload: unknown, fallback: string): string {
  if (typeof payload === 'object' && payload !== null) {
    const record = payload as Record<string, unknown>;
    if (typeof record.message === 'string') return record.message;
    if (typeof record.error === 'string') return record.error;
  }
  return fallback;
}

export interface JoinOutcome {
  /** 201 — to'g'ridan qo'shildi; 202 — organizer tasdig'ini kutmoqda. */
  pendingApproval: boolean;
}

export async function joinTournament(
  tournamentId: number,
  teamName: string,
): Promise<ActionResult<JoinOutcome>> {
  const response = await fetch(`/api/tournaments/tournaments/${tournamentId}/teams`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamName }),
    credentials: 'include',
  });
  const payload = await readJson(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: messageFrom(payload, "Turnirga qo'shilib bo'lmadi"),
    };
  }
  return { ok: true, data: { pendingApproval: response.status === 202 } };
}

export async function leaveTournament(tournamentId: number): Promise<ActionResult> {
  const response = await fetch(`/api/tournaments/tournaments/${tournamentId}/teams/me`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) {
    const payload = await readJson(response);
    return {
      ok: false,
      status: response.status,
      message: messageFrom(payload, "Turnirni tark etib bo'lmadi"),
    };
  }
  return { ok: true, data: undefined };
}
