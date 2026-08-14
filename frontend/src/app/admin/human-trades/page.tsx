import { AdminHumanTrades } from '@/components/admin/admin-human-trades';
import { getEscalatedHumanTrades, getTradeAdmins } from '@/lib/trade-server';
import { FEATURES } from '@/lib/feature-flags';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AdminHumanTradesPage() {
  // Human trade admin is closed for use (FEATURES.humanAdmin). notFound()
  // rather than a "coming soon" screen: the feature is not arriving, it is
  // switched off, and a 404 is the honest answer for a route with no way in.
  if (!FEATURES.humanAdmin) notFound();

  const [escalated, admins] = await Promise.all([
    getEscalatedHumanTrades(),
    getTradeAdmins(undefined, 'DEFAULT'),
  ]);

  return <AdminHumanTrades initialEscalated={escalated} admins={admins} />;
}
