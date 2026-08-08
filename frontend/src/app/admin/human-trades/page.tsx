import { AdminHumanTrades } from '@/components/admin/admin-human-trades';
import { getEscalatedHumanTrades, getTradeAdmins } from '@/lib/trade-server';

export const dynamic = 'force-dynamic';

export default async function AdminHumanTradesPage() {
  const [escalated, admins] = await Promise.all([
    getEscalatedHumanTrades(),
    getTradeAdmins(undefined, 'DEFAULT'),
  ]);

  return <AdminHumanTrades initialEscalated={escalated} admins={admins} />;
}
