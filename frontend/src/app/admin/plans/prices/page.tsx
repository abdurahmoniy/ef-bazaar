import { AdminPlanPrices } from '@/components/admin/admin-plan-prices';
import { getPlanPricesSSR } from '@/lib/payment-admin-server';

export default async function AdminPlanPricesPage() {
  const rows = await getPlanPricesSSR();
  if (!rows) {
    return (
      <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-semibold text-foreground">
        Narxlarni yuklab bo‘lmadi. Keyinroq urinib ko‘ring.
      </p>
    );
  }
  return <AdminPlanPrices initial={rows} />;
}
