import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { NewListingEntry } from '@/components/marketplace/new-listing-entry';
import { TelegramRequiredPrompt } from '@/components/auth/telegram-required-prompt';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { getMe } from '@/lib/auth';
import { SEEDED_LISTING_ATTRIBUTE_DEFINITIONS } from '@/lib/listing-form-data';
import { getMyAccountsServer } from '@/lib/accounts-server';
import { getAttributeDefinitions } from '@/lib/marketplace-server';
import { resolveOptionalUser } from '@/lib/optional-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "E'lon yaratish",
  robots: { index: false, follow: false },
};

export default async function NewListingPage() {
  const user = await resolveOptionalUser(getMe);
  if (!user) redirect('/auth/login?from=/marketplace/new');
  const botUsername = (process.env.NEXT_PUBLIC_TELEGRAM_BOT ?? process.env.TELEGRAM_BOT_USERNAME ?? '').replace('@', '');

  const [remoteDefinitions, accounts] = await Promise.all([
    getAttributeDefinitions(),
    getMyAccountsServer(),
  ]);
  const definitions =
    remoteDefinitions.length > 0 ? remoteDefinitions : SEEDED_LISTING_ATTRIBUTE_DEFINITIONS;

  return (
    <MarketplaceShell user={user} activeTab="sell" hideSearch hideBottomNav backHref="/marketplace" backLabel="Bozor">
      <section className="mx-auto w-full max-w-3xl space-y-4">
        <header className="hidden sm:block">
          <p className="text-[11px] font-bold uppercase tracking-wide text-primary">Marketplace</p>
          <h1 className="mt-0.5 text-2xl sm:text-3xl font-black text-foreground">Akkount joylash</h1>
          <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground">
            Bir necha daqiqada e&apos;loningizni yarating — rasm, tavsif, narx.
          </p>
        </header>
        {user.telegramLinked ? (
          <NewListingEntry
            accounts={accounts}
            attributeDefinitions={definitions}
            botUsername={botUsername}
          />
        ) : (
          <TelegramRequiredPrompt purpose="listing" botUsername={botUsername} />
        )}
      </section>
    </MarketplaceShell>
  );
}
