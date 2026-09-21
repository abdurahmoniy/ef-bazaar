import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AccountForm } from '@/components/marketplace/account-form';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { getMe } from '@/lib/auth';
import { getAttributeDefinitions } from '@/lib/marketplace-server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Yangi akkount",
  robots: { index: false, follow: false },
};

export default async function NewAccountPage() {
  const user = await getMe();
  if (!user) redirect('/auth/login?from=/profile/accounts/new');

  const definitions = await getAttributeDefinitions();
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT || 'EfBazaarBot';

  return (
    <MarketplaceShell user={user} activeTab="profile" hideSearch>
      <div className="space-y-4 pb-24">
        <header className="space-y-1">
          <h1 className="text-lg font-black text-foreground">Yangi akkount</h1>
          <p className="text-xs text-muted-foreground">
            Bir marta to&apos;ldiring — bozorga chiqarishni keyin, istagan vaqtingizda qilasiz.
          </p>
        </header>
        <AccountForm attributeDefinitions={definitions} botUsername={botUsername} />
      </div>
    </MarketplaceShell>
  );
}
