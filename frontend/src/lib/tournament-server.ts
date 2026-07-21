import { apiFetch } from '@/lib/api';
import type { Tournament } from '@/lib/tournament-types';

/**
 * Server-side (RSC) Chempionat-X o'qishlari.
 *
 * Public reads to'g'ridan Chempionat-X public API'siga (2 xil serverda ishlaydi —
 * efBazaar nginx proxy kerak emas). Faqat metadata generation va fallback SSR
 * uchun ishlatiladi; interaktiv sahifa RTK Query hooks bilan client-side yuklaydi.
 *
 * Authed reads (joined) — efBazaar nginx orqali (X-User-Id header injection kerak).
 */

const CHEMPIONAT_PUBLIC_BASE =
  process.env.CHEMPIONAT_PUBLIC_API_URL || 'https://api.chempox.uz/api';

export async function getTournament(id: string): Promise<Tournament | null> {
  try {
    const res = await fetch(`${CHEMPIONAT_PUBLIC_BASE}/public/tournaments/${id}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return (await res.json()) as Tournament;
  } catch (error) {
    console.error('[tournament-server] getTournament failed:', error);
    return null;
  }
}

/**
 * Joriy user qatnashayotgan turnir id'lari (auth talab qiladi; anonimda bo'sh).
 * efBazaar nginx orqali — cookie'dan JWT olinadi, X-User-Id header injection Chempionat
 * dual-auth filter'iga uzatiladi.
 */
export async function getJoinedTournamentIds(): Promise<Set<number>> {
  try {
    const joined = await apiFetch<Tournament[]>('/tournaments/tournaments/joined');
    return new Set(joined.map((t) => t.id));
  } catch {
    return new Set();
  }
}

