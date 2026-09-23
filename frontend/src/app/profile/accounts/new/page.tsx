import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AccountForm } from '@/components/marketplace/account-form';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { getMe } from '@/lib/auth';
import { getAttributeDefinitions } from '@/lib/marketplace-server';
import { SEEDED_LISTING_ATTRIBUTE_DEFINITIONS } from '@/lib/listing-form-data';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Yangi akkount",
  robots: { index: false, follow: false },
};

export default async function NewAccountPage() {
  const user = await getMe();
  if (!user) redirect('/auth/login?from=/profile/accounts/new');

  const remoteDefinitions = await getAttributeDefinitions();
  const definitions = remoteDefinitions.length > 0 ? remoteDefinitions : SEEDED_LISTING_ATTRIBUTE_DEFINITIONS;
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT || 'EfBazaarBot';

  return (
    <MarketplaceShell user={user} activeTab="accounts" hideSearch hideBottomNav backHref="/profile?tab=accounts" backLabel="Akkountlarim">
      <section className="mx-auto w-full max-w-2xl space-y-6 py-2 sm:space-y-8 sm:py-6">
        <header>
          <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">Yangi akkount</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Akkount ma’lumotlarini kiriting. Keyin saqlang yoki sotuvga qo‘ying.
          </p>
        </header>
        <AccountForm attributeDefinitions={definitions} botUsername={botUsername} />
      </section>
    </MarketplaceShell>
  );
}
