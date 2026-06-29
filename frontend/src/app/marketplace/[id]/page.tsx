import type { Metadata } from 'next';

import { MarketplaceListingDetail } from '@/components/marketplace/marketplace-listing-detail';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { getMe } from '@/lib/auth';
import { resolveOptionalUser } from '@/lib/optional-auth';

export const dynamic = 'force-dynamic';

interface ListingPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ListingPageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Listing ${id.slice(0, 8)}`,
    robots: { index: false, follow: true },
  };
}

export default async function ListingPage({ params }: ListingPageProps) {
  const { id } = await params;
  const user = await resolveOptionalUser(getMe);

  return (
    <MarketplaceShell user={user}>
      <MarketplaceListingDetail listingId={id} authenticated={Boolean(user)} />
    </MarketplaceShell>
  );
}
