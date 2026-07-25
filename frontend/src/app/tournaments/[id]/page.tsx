import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { TournamentDetail } from '@/components/tournaments/tournament-detail';
import { getMe } from '@/lib/auth';
import { resolveOptionalUser } from '@/lib/optional-auth';
import { getJoinedTournamentIds, getTournament } from '@/lib/tournament-server';

export const dynamic = 'force-dynamic';

interface TournamentPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: TournamentPageProps): Promise<Metadata> {
  const { id } = await params;
  const tournament = await getTournament(id);
  return { title: tournament ? `${tournament.name} — Turnir` : 'Turnir' };
}

export default async function TournamentPage({ params }: TournamentPageProps) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const [tournament, viewer] = await Promise.all([
    getTournament(id),
    resolveOptionalUser(getMe),
  ]);
  if (!tournament) notFound();

  const joinedIds = viewer ? await getJoinedTournamentIds() : new Set<number>();
  const joined = joinedIds.has(tournament.id);

  return (
    <MarketplaceShell user={viewer} activeTab="tournaments" hideSearch backHref="/tournaments">
      <TournamentDetail tournament={tournament} viewer={viewer} joined={joined} />
    </MarketplaceShell>
  );
}
