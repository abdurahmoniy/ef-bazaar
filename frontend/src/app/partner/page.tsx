import { redirect } from 'next/navigation';

import { PartnerDashboard } from '@/components/partners/partner-dashboard';
import { getMe } from '@/lib/auth';
import { canOpenPartnerPanel } from '@/lib/partner-panel';
import { getMyApplicationServer } from '@/lib/partners-server';

export const dynamic = 'force-dynamic';

export default async function PartnerDashboardPage() {
  const user = await getMe();
  if (!user) redirect('/auth/login?from=/partner');

  // Eshik ROLGA emas, hamkorlik FAKTIGA qaraydi — sababi
  // canOpenPartnerPanel izohida.
  const application = await getMyApplicationServer();
  if (!canOpenPartnerPanel(application)) redirect('/partnership');

  return <PartnerDashboard />;
}
