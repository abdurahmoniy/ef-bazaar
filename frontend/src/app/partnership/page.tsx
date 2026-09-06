import type { Metadata } from 'next';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { PartnershipFlow } from '@/components/partners/partnership-flow';
import { getMe } from '@/lib/auth';
import { resolveOptionalUser } from '@/lib/optional-auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Telegram kanalingiz bilan hamkor bo‘ling',
  description: 'efBazaar hamkorligi: kanalga e’lon joylash narxini belgilang, post ko‘rinishini sozlang va natijalarni kuzating.',
};

export default async function PartnershipPage() {
  const user = await resolveOptionalUser(getMe);
  // Read runtime configuration on the server, so container values work after build.
  const botUsername = (process.env.NEXT_PUBLIC_TELEGRAM_BOT ?? process.env.TELEGRAM_BOT_USERNAME ?? '').replace('@', '');
  return (
    <MarketplaceShell user={user} hideSearch backHref="/marketplace">
      <PartnershipFlow botUsername={botUsername} authenticated={!!user} telegramLinked={user?.telegramLinked ?? false} />
    </MarketplaceShell>
  );
}
