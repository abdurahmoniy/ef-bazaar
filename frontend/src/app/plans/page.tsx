import type { Metadata } from 'next';

import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { PlansView } from '@/components/plans/plans-view';
import { getMe } from '@/lib/auth';
import { getMyPlanSSR, getPlanCatalogSSR } from '@/lib/plans-server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Tariflar' };

export default async function PlansPage() {
  const user = await getMe();
  // The catalog is public; the caller's own plan exists only when signed in.
  const [catalog, mine] = await Promise.all([
    getPlanCatalogSSR(),
    user ? getMyPlanSSR() : Promise.resolve(null),
  ]);

  return (
    <MarketplaceShell user={user} activeTab="profile" hideSearch hideHeader backHref="/marketplace">
      {catalog ? (
        <PlansView key={user?.id ?? 'anonymous'} catalog={catalog} mine={mine} signedIn={user !== null} />
      ) : (
        <p className="p-6 text-sm text-muted-foreground">
          Tariflarni yuklab bo‘lmadi. Keyinroq urinib ko‘ring.
        </p>
      )}
    </MarketplaceShell>
  );
}
