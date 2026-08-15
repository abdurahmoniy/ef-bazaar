import { WithdrawalQueue } from '@/components/payment/withdrawal-queue';
import { listWithdrawalsSSR } from '@/lib/payment-admin-server';

/**
 * Payouts waiting to be sent by hand.
 *
 * Deliberately **not** behind the `wallet` feature flag, for the same reason as
 * the card manager and the unmatched queue: the money on these tickets is
 * already frozen, so an admin must be able to settle them even if the wallet UI
 * is switched off.
 *
 * The admin gate, header, tab bar and `force-dynamic` come from
 * `src/app/admin/layout.tsx`.
 */
export default async function AdminWithdrawalsPage() {
  const items = await listWithdrawalsSSR();

  return (
    <div className="space-y-4">
      {items ? (
        <WithdrawalQueue initialItems={items} />
      ) : (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm font-semibold text-destructive">
          Pul yechish so&apos;rovlarini olishda xatolik. Sahifani yangilab ko&apos;ring.
        </p>
      )}
    </div>
  );
}
