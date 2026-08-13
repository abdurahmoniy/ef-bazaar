import { PlatformCardList } from '@/components/payment/platform-card-list';
import { listPlatformCardsSSR } from '@/lib/payment-admin-server';

/**
 * Platform cards — the cards users transfer *to*.
 *
 * Deliberately **not** behind the `wallet` feature flag: this is where the
 * first card is created, and nothing in the deposit rail works until one
 * exists. Gating it would mean the flag could never be flipped.
 *
 * The admin gate, the header and the tab bar all come from
 * `src/app/admin/layout.tsx` (which is also where `force-dynamic` lives).
 */
export default async function AdminPaymentCardsPage() {
  const cards = await listPlatformCardsSSR();

  if (!cards) {
    return (
      <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm font-semibold text-destructive">
        Kartalarni olishda xatolik. Sahifani yangilab ko&apos;ring.
      </p>
    );
  }

  return <PlatformCardList initialCards={cards} />;
}
