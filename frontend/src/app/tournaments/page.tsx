import type { Metadata } from 'next';
import { Trophy } from 'lucide-react';

import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { TournamentCard } from '@/components/tournaments/tournament-card';
import { getMe } from '@/lib/auth';
import { resolveOptionalUser } from '@/lib/optional-auth';
import {
  getActiveTournaments,
  getJoinableTournaments,
} from '@/lib/tournament-server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Turnirlar',
  description:
    "eFootball turnirlari — ro'yxatdan o'ting, jadval va natijalarni kuzating.",
};

/** Public tournaments list — Chempionat-X'dan (fail-soft, anonim ham ko'radi). */
export default async function TournamentsPage() {
  const [viewer, joinable, active] = await Promise.all([
    resolveOptionalUser(getMe),
    getJoinableTournaments(),
    getActiveTournaments(),
  ]);

  // Bir turnir ikkala ro'yxatda ham kelishi mumkin — active ustun turadi.
  const activeIds = new Set(active.map((t) => t.id));
  const joinableOnly = joinable.filter((t) => !activeIds.has(t.id));
  const empty = active.length === 0 && joinableOnly.length === 0;

  return (
    <MarketplaceShell user={viewer} hideSearch backHref="/marketplace">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-black text-foreground">Turnirlar</h1>
            <p className="text-xs text-muted-foreground">
              eFootball turnirlari — qatnashing, jadval va natijalarni kuzating.
            </p>
          </div>
        </div>

        {empty && (
          <div className="mt-5 rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Hozircha ochiq turnirlar yo'q. Keyinroq qaytib ko'ring.
          </div>
        )}

        {active.length > 0 && (
          <section className="mt-5">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Davom etayotgan
            </h2>
            <div className="mt-2 space-y-3">
              {active.map((t) => (
                <TournamentCard key={t.id} tournament={t} />
              ))}
            </div>
          </section>
        )}

        {joinableOnly.length > 0 && (
          <section className="mt-5">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Ro'yxatdan o'tish ochiq
            </h2>
            <div className="mt-2 space-y-3">
              {joinableOnly.map((t) => (
                <TournamentCard key={t.id} tournament={t} />
              ))}
            </div>
          </section>
        )}
      </div>
    </MarketplaceShell>
  );
}
