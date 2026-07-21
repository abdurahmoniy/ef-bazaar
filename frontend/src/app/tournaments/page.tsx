import type { Metadata } from 'next';

import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { TournamentsList } from '@/components/tournaments/tournaments-list';
import { getMe } from '@/lib/auth';
import { resolveOptionalUser } from '@/lib/optional-auth';

export const metadata: Metadata = {
  title: 'Turnirlar',
  description:
    "eFootball turnirlari — ro'yxatdan o'ting, jadval va natijalarni kuzating.",
};

export default async function TournamentsPage() {
  const viewer = await resolveOptionalUser(getMe);
  return (
    <MarketplaceShell user={viewer} hideSearch backHref="/marketplace">
      <TournamentsList />
    </MarketplaceShell>
  );
}
