import { redirect } from 'next/navigation';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { PartnerDashboard } from '@/components/partners/partner-dashboard';
import { getMe } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function PartnerDashboardPage() {
  const user = await getMe();
  if (!user) redirect('/auth/login?from=/partner');

  // The client distinguishes a missing application from a failed status lookup,
  // and loads panel data only after the application is confirmed as approved.
  return (
    <MarketplaceShell user={user} hideSearch backHref="/partnership">
      <PartnerDashboard />
    </MarketplaceShell>
  );
}
