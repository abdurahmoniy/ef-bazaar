import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { getMe } from '@/lib/auth';
import { getTradeById } from '@/lib/trade-server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Savdo', robots: { index: false, follow: false } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve the current chat through the authenticated trade API, never a ledger guess. */
export default async function WalletTradePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getMe();
  if (!user) redirect(`/auth/login?from=${encodeURIComponent(`/hamyon/savdo/${id}`)}`);
  const trade = UUID.test(id) ? await getTradeById(id) : null;
  if (trade?.id === id && [trade.buyerId, trade.sellerId].includes(user.id)
    && trade.chatId && UUID.test(trade.chatId)) {
    redirect(`/chats/${trade.chatId}`);
  }
  return (
    <MarketplaceShell user={user} activeTab="wallet" hideSearch backHref="/hamyon">
      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h1 className="text-lg font-bold">Savdoni ochib bo‘lmadi</h1>
        <p className="text-sm text-muted-foreground">Savdo hozir mavjud emas yoki unga kirish huquqingiz yo‘q. Hamyon tarixidagi amaliyot raqami bilan yordam xizmatiga murojaat qilishingiz mumkin.</p>
        <Link href="/hamyon" className="inline-flex min-h-11 items-center font-semibold text-primary underline">Hamyonga qaytish</Link>
      </section>
    </MarketplaceShell>
  );
}
