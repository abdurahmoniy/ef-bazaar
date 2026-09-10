import { AnalyticsOverview } from '@/components/payment/analytics-overview';
import { PlatformCardList } from '@/components/payment/platform-card-list';
import { UserbotBanner } from '@/components/payment/userbot-banner';
import {
  getPaymentAnalyticsSSR,
  getUserbotStatusSSR,
  listPlatformCardsSSR,
} from '@/lib/payment-admin-server';

/**
 * Platform cards — the cards users transfer *to*, and the books behind them.
 *
 * Deliberately **not** behind the `wallet` feature flag: this is where the
 * first card is created, and nothing in the deposit rail works until one
 * exists. Gating it would mean the flag could never be flipped.
 *
 * The banner rides along here too: an admin adding cards is exactly the person
 * who should learn that the observer is down.
 *
 * The three reads are independent on purpose. Analytics failing must not cost
 * the admin the card manager — the queue is the operational surface, the
 * dashboard is the reporting one.
 *
 * The admin gate, the header and the tab bar all come from
 * `src/app/admin/layout.tsx` (which is also where `force-dynamic` lives).
 */
export default async function AdminPaymentCardsPage() {
  const [cards, userbot, analytics] = await Promise.all([
    listPlatformCardsSSR(),
    getUserbotStatusSSR(),
    getPaymentAnalyticsSSR(),
  ]);

  return (
    <div className="space-y-5">
      {userbot && <UserbotBanner status={userbot} />}

      {analytics ? (
        <AnalyticsOverview data={analytics} />
      ) : (
        <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
          Moliyaviy ko&apos;rsatkichlarni olishda xatolik. Kartalar ro&apos;yxati quyida
          ishlayveradi.
        </p>
      )}

      {cards ? (
        <PlatformCardList initialCards={cards} throughput={analytics?.cardThroughput ?? []} />
      ) : (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm font-semibold text-destructive">
          Kartalarni olishda xatolik. Sahifani yangilab ko&apos;ring.
        </p>
      )}
    </div>
  );
}
