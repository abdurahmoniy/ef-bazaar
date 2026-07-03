import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import { MarketplaceListingDetail } from '@/components/marketplace/marketplace-listing-detail';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { getMe } from '@/lib/auth';
import {
  getListing,
  getSimilarListings,
  getUserProfile,
} from '@/lib/marketplace-server';
import { resolveOptionalUser } from '@/lib/optional-auth';

export const dynamic = 'force-dynamic';

interface ListingPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ListingPageProps): Promise<Metadata> {
  const { id } = await params;
  const result = await getListing(id);
  if (!result.ok) {
    return {
      title: result.error.status === 404 ? "E'lon topilmadi" : "E'lon yuklanmadi",
      robots: { index: false, follow: false },
    };
  }
  const title = result.data.description.split('\n')[0]?.trim() || 'eFootball account';
  return {
    title,
    description: result.data.description.slice(0, 160),
    robots: { index: false, follow: true },
  };
}

export default async function ListingPage({ params }: ListingPageProps) {
  const { id } = await params;
  const [viewer, result] = await Promise.all([
    resolveOptionalUser(getMe),
    getListing(id),
  ]);

  if (!result.ok) {
    if (result.error.status === 404) notFound();
    return (
      <MarketplaceShell user={viewer} activeTab="home" backHref="/marketplace" backLabel="Bozor">
        <section className="mx-auto w-full max-w-3xl space-y-4">
          <ApiErrorPanel title="E'lon yuklanmadi" error={result.error} />
        </section>
      </MarketplaceShell>
    );
  }

  const listing = result.data;
  const [seller, similar] = await Promise.all([
    getUserProfile(listing.sellerId),
    getSimilarListings(listing),
  ]);

  return (
    <MarketplaceShell user={viewer} activeTab="home" backHref="/marketplace" backLabel="Bozor">
      <MarketplaceListingDetail
        listing={listing}
        viewer={viewer}
        seller={seller}
        similarListings={similar}
      />
    </MarketplaceShell>
  );
}
