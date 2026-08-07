import type { Metadata } from 'next';

import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { TournamentsList } from '@/components/tournaments/tournaments-list';
import { getMe } from '@/lib/auth';
import { resolveOptionalUser } from '@/lib/optional-auth';
import { getJoinedTournamentIds } from '@/lib/tournament-server';

export const metadata: Metadata = {
  title: 'Turnirlar',
  description:
    "eFootball turnirlari — ro'yxatdan o'ting, jadval va natijalarni kuzating.",
};

export const dynamic = 'force-dynamic';

export default async function TournamentsPage() {
  const viewer = await resolveOptionalUser(getMe);
  // Joined id'lar faqat authed viewer uchun — kartalarda "Qatnashyapsiz" belgisi
  // va "Mening turnirlarim" filtri shundan.
  const joinedIds = viewer ? await getJoinedTournamentIds() : new Set<number>();

  return (
    <MarketplaceShell user={viewer} activeTab="tournaments" hideSearch backHref="/marketplace">
      <TournamentsList joinedIds={[...joinedIds]} />
    </MarketplaceShell>
  );
}
