import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { AccountForm } from '@/components/marketplace/account-form';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { AccountEmailField } from '@/components/profile/account-email-field';
import { getAccountServer } from '@/lib/accounts-server';
import { getMe } from '@/lib/auth';
import { getAttributeDefinitions } from '@/lib/marketplace-server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Akkountni tahrirlash',
  robots: { index: false, follow: false },
};

interface EditAccountPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditAccountPage({ params }: EditAccountPageProps) {
  const { id } = await params;
  const user = await getMe();
  if (!user) redirect(`/auth/login?from=/profile/accounts/${id}`);

  const account = await getAccountServer(id);
  if (!account) notFound();
  // Sotilgan akkount tarixda faqat o'qish uchun — tahrir sahifasi yo'q.
  if (account.status === 'ARCHIVED') redirect('/profile?tab=accounts');

  const definitions = await getAttributeDefinitions();
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT || 'EfBazaarBot';

  return (
    <MarketplaceShell user={user} activeTab="accounts" hideSearch hideBottomNav backHref="/profile?tab=accounts" backLabel="Akkountlarim">
      <div className="space-y-4 pb-24">
        <header className="space-y-1">
          <h1 className="text-lg font-black text-foreground">
            {account.title?.trim() || 'Akkountni tahrirlash'}
          </h1>
          <p className="text-xs text-muted-foreground">
            Yangi o&apos;yinchi tushdimi? Akkountingizni yangilab qo&apos;ying.
          </p>
        </header>

        <AccountEmailField account={account} />

        <AccountForm
          attributeDefinitions={definitions}
          account={account}
          botUsername={botUsername}
        />
      </div>
    </MarketplaceShell>
  );
}
