import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { FeatureGate } from '@/components/feature-gate';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { WalletView } from '@/components/payment/wallet-view';
import { getMe } from '@/lib/auth';
import { isFeatureEnabled } from '@/lib/feature-flags';
import {
  getActiveInvoiceSSR,
  getWallet,
} from '@/lib/payment-server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Hamyon',
  robots: { index: false, follow: false },
};

export default async function WalletPage() {
  // The gate runs before auth and before the fetches, unlike /tournaments,
  // which can gate around its rendered tree. This page redirects a signed-out
  // visitor to login and makes two payment-service calls — while the flag is
  // off, a visitor should just see "Tez kunda" and payment-service should not
  // be touched at all.
  if (!isFeatureEnabled('wallet')) {
    return (
      <MarketplaceShell user={null} hideSearch backHref="/marketplace">
        <FeatureGate feature="wallet">{null}</FeatureGate>
      </MarketplaceShell>
    );
  }

  const user = await getMe();
  if (!user) redirect('/auth/login?from=/hamyon');

  const [wallet, activeInvoice] = await Promise.all([
    getWallet(),
    getActiveInvoiceSSR(),
  ]);

  return (
    <MarketplaceShell user={user} activeTab="wallet" hideSearch backHref="/profile">
      {wallet ? (
        <WalletView wallet={wallet} initialInvoice={activeInvoice} />
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card px-4 py-16 text-center shadow-xs">
          <h1 className="text-base font-bold text-foreground">
            Hamyon ma‘lumotini olib bo‘lmadi
          </h1>
          <p className="mx-auto mt-1 max-w-md text-xs sm:text-sm text-muted-foreground">
            Aloqani tekshirib, sahifani yangilang.
          </p>
        </div>
      )}
    </MarketplaceShell>
  );
}
