import { AdminCommissionForm } from '@/components/admin/admin-commission-form';
import { getTradeCommissionConfigSSR } from '@/lib/payment-admin-server';
import { DEFAULT_TRADE_COMMISSION_CONFIG } from '@/lib/trade-commission';

/**
 * Smart Admin Commission Configuration — admin control room for platform trade fees.
 *
 * The admin gate, header, and tab navigation come from `src/app/admin/layout.tsx`.
 */
export default async function AdminCommissionPage() {
  const config = await getTradeCommissionConfigSSR();

  return (
    <div className="space-y-4">
      <AdminCommissionForm initialConfig={config ?? DEFAULT_TRADE_COMMISSION_CONFIG} />
    </div>
  );
}
