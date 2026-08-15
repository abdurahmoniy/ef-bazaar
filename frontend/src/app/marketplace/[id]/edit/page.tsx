import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { DeleteListingButton } from '@/components/marketplace/delete-listing-button';
import { ListingForm } from '@/components/marketplace/listing-form';
import { MarkSoldButton } from '@/components/marketplace/mark-sold-button';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { getMe } from '@/lib/auth';
import { SEEDED_LISTING_ATTRIBUTE_DEFINITIONS } from '@/lib/listing-form-data';
import { getAttributeDefinitions, getListing } from '@/lib/marketplace-server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "E'lonni tahrirlash",
  robots: { index: false, follow: false },
};

interface EditPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditListingPage({ params }: EditPageProps) {
  const { id } = await params;
  const user = await getMe();
  if (!user) redirect(`/auth/login?from=/marketplace/${id}/edit`);

  const result = await getListing(id);
  if (!result.ok) {
    if (result.error.status === 404) notFound();
    redirect(`/marketplace/${id}`);
  }
  if (result.data.sellerId !== user.id) redirect(`/marketplace/${id}`);

  const remoteDefinitions = await getAttributeDefinitions();
  const definitions =
    remoteDefinitions.length > 0 ? remoteDefinitions : SEEDED_LISTING_ATTRIBUTE_DEFINITIONS;

  return (
    <MarketplaceShell user={user} activeTab="profile" hideSearch backHref={`/marketplace/${id}`} backLabel="E'lon">
      <section className="mx-auto w-full max-w-3xl space-y-4">
        <header>
          <p className="text-xs font-bold uppercase tracking-wide text-primary">Marketplace</p>
          <h1 className="mt-1 text-3xl font-black text-foreground">E'lonni tahrirlash</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Yangi rasm yuklamasangiz, joriy rasmlar saqlanadi.
          </p>
        </header>
        <ListingForm attributeDefinitions={definitions} initialListing={result.data} />
        {result.data.status === 'ACTIVE' && (
          <div className="pt-2">
            <MarkSoldButton listingId={id} />
          </div>
        )}
        <DeleteListingButton listingId={id} />
      </section>
    </MarketplaceShell>
  );
}
