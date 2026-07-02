import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ListingForm } from '@/components/marketplace/listing-form';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { getMe } from '@/lib/auth';
import { resolveOptionalUser } from '@/lib/optional-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "E'lon yaratish",
  robots: { index: false, follow: false },
};

export default async function NewListingPage() {
  const user = await resolveOptionalUser(getMe);
  if (!user) redirect('/auth/login');

  return (
    <MarketplaceShell user={user}>
      <section className="mx-auto w-full max-w-2xl space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-primary">Marketplace</p>
          <h1 className="mt-1 text-2xl font-black text-foreground">Akkount joylash</h1>
        </div>
        <div className="rounded-xl border border-border bg-white p-4 shadow-card">
          <ListingForm />
        </div>
      </section>
    </MarketplaceShell>
  );
}
