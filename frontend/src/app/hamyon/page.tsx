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
  getWalletHistorySSR,
} from '@/lib/payment-server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Hamyon',
  robots: { index: false, follow: false },
};

export default async function WalletPage() {
  // The gate runs before auth and before the fetches, unlike /tournaments,
  // which can gate around its rendered tree. This page redirects a signed-out
  // visitor to login and makes three payment-service calls — while the flag is
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

  const [wallet, activeInvoice, history] = await Promise.all([
    getWallet(),
    getActiveInvoiceSSR(),
    getWalletHistorySSR(),
  ]);

  return (
    <MarketplaceShell user={user} hideSearch backHref="/profile">
      {wallet ? (
        <WalletView wallet={wallet} initialInvoice={activeInvoice} history={history} />
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card px-4 py-12 text-center shadow-card">
          <h1 className="text-base font-black text-foreground">
            Hamyon ma‘lumotini olib bo‘lmadi
          </h1>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Aloqani tekshirib, sahifani yangilang.
          </p>
        </div>
      )}
    </MarketplaceShell>
  );
}
