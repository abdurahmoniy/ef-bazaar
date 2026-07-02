import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

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
  const listing = await getListing(id);
  if (!listing) {
    return {
      title: "E'lon topilmadi",
      robots: { index: false, follow: false },
    };
  }
  const title = listing.description.split('\n')[0]?.trim() || 'eFootball account';
  return {
    title,
    description: listing.description.slice(0, 160),
    robots: { index: false, follow: true },
  };
}

export default async function ListingPage({ params }: ListingPageProps) {
  const { id } = await params;
  const listing = await getListing(id);
  if (!listing) notFound();

  const [viewer, seller, similar] = await Promise.all([
    resolveOptionalUser(getMe),
    getUserProfile(listing.sellerId),
    getSimilarListings(listing),
  ]);

  return (
    <MarketplaceShell user={viewer} activeTab="home">
      <MarketplaceListingDetail
        listing={listing}
        viewer={viewer}
        seller={seller}
        similarListings={similar}
      />
    </MarketplaceShell>
  );
}
