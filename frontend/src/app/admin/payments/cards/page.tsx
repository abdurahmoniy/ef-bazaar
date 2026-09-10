import { AnalyticsOverview } from '@/components/payment/analytics-overview';
import { CardHistory } from '@/components/payment/card-history';
import { PlatformCardList } from '@/components/payment/platform-card-list';
import { UserbotBanner } from '@/components/payment/userbot-banner';
import {
  getPaymentAnalyticsSSR,
  getUserbotStatusSSR,
  listCardHistorySSR,
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
 * The four reads are independent on purpose. Analytics or history failing must
 * not cost the admin the card manager — the queue is the operational surface,
 * the other two are reporting.
 *
 * The admin gate, the header and the tab bar all come from
 * `src/app/admin/layout.tsx` (which is also where `force-dynamic` lives).
 */
export default async function AdminPaymentCardsPage() {
  const [cards, userbot, analytics, history] = await Promise.all([
    listPlatformCardsSSR(),
    getUserbotStatusSSR(),
    getPaymentAnalyticsSSR(),
    listCardHistorySSR(),
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

      {/* `now` is resolved once here, on the server, and handed down: the day
          headings must not be computed from two different clocks across a
          render and its hydration. */}
      {history && <CardHistory initialMovements={history} now={new Date()} />}
    </div>
  );
}
