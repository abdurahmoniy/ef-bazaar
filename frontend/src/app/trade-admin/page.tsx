import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { TradeAdminWorkspace } from '@/components/trade-admin/trade-admin-workspace';
import { getMe } from '@/lib/auth';
import { isTradeAdmin } from '@/lib/trade-human';
import {
  getMyTradeAdminInvitations,
  getMyTradeAdminProfile,
  getMyTradeAdminTrades,
} from '@/lib/trade-server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Inson admin',
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams?: Promise<{ tradeId?: string }>;
}

export default async function TradeAdminPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const user = await getMe();
  if (!user) redirect('/auth/login?from=/trade-admin');
  if (!isTradeAdmin(user)) redirect('/marketplace');

  const [profile, invitations, trades] = await Promise.all([
    getMyTradeAdminProfile(),
    getMyTradeAdminInvitations(),
    getMyTradeAdminTrades(),
  ]);

  return (
    <MarketplaceShell user={user} hideSearch>
      <TradeAdminWorkspace
        initialProfile={profile}
        initialInvitations={invitations}
        initialTrades={trades}
        initialTradeId={params.tradeId}
      />
    </MarketplaceShell>
  );
}
