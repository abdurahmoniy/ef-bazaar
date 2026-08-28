import { redirect } from 'next/navigation';

import { PartnerDashboard } from '@/components/partners/partner-dashboard';
import { isPartner } from '@/lib/admin';
import { getMe } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function PartnerDashboardPage() {
  const user = await getMe();
  if (!user) redirect('/auth/login?from=/partner');
  // Hamkor bo'lmagan odam bu yerga tushsa, uni ariza sahifasiga yuboramiz:
  // "ruxsat yo'q" xatosi emas, chunki bu yo'l unga hali ochiq.
  if (!isPartner(user)) redirect('/partnership');

  return <PartnerDashboard />;
}
