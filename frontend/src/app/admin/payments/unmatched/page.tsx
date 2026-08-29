import { ResolvedHistory } from '@/components/payment/resolved-history';
import { UnmatchedQueue } from '@/components/payment/unmatched-queue';
import { UserbotBanner } from '@/components/payment/userbot-banner';
import { getUserbotStatusSSR, listUnmatchedSSR } from '@/lib/payment-admin-server';

/**
 * Card credits nobody could be matched to, plus the userbot's pulse.
 *
 * Deliberately **not** behind the `wallet` feature flag, for the same reason as
 * the card manager: these are the tools that make the rail safe to switch on.
 *
 * The admin gate, the header, the tab bar and `force-dynamic` all come from
 * `src/app/admin/layout.tsx`, which also owns the page container — no padding
 * or max-width belongs here.
 */
export default async function AdminUnmatchedPage() {
  const [items, userbot] = await Promise.all([listUnmatchedSSR(), getUserbotStatusSSR()]);

  return (
    <div className="space-y-4">
      {userbot && <UserbotBanner status={userbot} />}

      {items ? (
        <UnmatchedQueue initialItems={items} />
      ) : (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm font-semibold text-destructive">
          Tekshirilmagan tushumlarni olishda xatolik. Sahifani yangilab ko&apos;ring.
        </p>
      )}

      {/*
        Tarix navbatdan MUSTAQIL: navbat bo'sh bo'lsa ham "bu pulni kim
        biriktirgan" degan savol qolaveradi, va u navbat yuklanmaganda ham
        javobsiz qolmasligi kerak.
      */}
      <ResolvedHistory />
    </div>
  );
}
