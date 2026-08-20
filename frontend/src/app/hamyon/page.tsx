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

export default async function WalletPage({
  searchParams,
}: {
  // `toldirish` carries the exact shortfall from wherever the user was turned
  // away — accepting a proposal the wallet cannot cover sends them here with
  // the missing amount already in the box.
  searchParams: Promise<{ toldirish?: string; keyin?: string }>;
}) {
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

  const params = await searchParams;
  const requested = Number(params.toldirish);
  // Where the user came from, so they can get back once the invoice is paid.
  // Same-origin only: this ends up in a link, and an absolute or
  // protocol-relative value would walk them off the site.
  const returnTo = params.keyin && params.keyin.startsWith('/')
    && !params.keyin.startsWith('//') ? params.keyin : undefined;
  const topUpAmount = Number.isFinite(requested) && requested > 0
    ? Math.ceil(requested)
    : undefined;

  const [wallet, activeInvoice, history] = await Promise.all([
    getWallet(),
    getActiveInvoiceSSR(),
    getWalletHistorySSR(),
  ]);

  return (
    <MarketplaceShell user={user} activeTab="wallet" hideSearch hideHeader backHref="/profile">
      {wallet ? (
        <WalletView
          wallet={wallet}
          initialInvoice={activeInvoice}
          history={history}
          telegramUsername={user.telegramUsername}
          topUpAmount={topUpAmount}
          returnTo={returnTo}
        />
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
