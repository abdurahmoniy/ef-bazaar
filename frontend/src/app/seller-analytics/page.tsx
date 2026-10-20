import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { SellerAnalyticsView } from '@/components/seller-analytics/seller-analytics-view';
import { getMe } from '@/lib/auth';
import { getMyPlanSSR } from '@/lib/plans-server';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sotuvchi hisoboti', robots: { index: false, follow: false } };
export default async function SellerAnalyticsPage() {
  const user = await getMe();
  if (!user) redirect('/auth/login?from=%2Fseller-analytics');
  // Payment initializes a new identity; marketplace alone authorizes analytics.
  await getMyPlanSSR();
  return <MarketplaceShell user={user} hideSearch backHref="/profile"><SellerAnalyticsView key={user.id} /></MarketplaceShell>;
}
