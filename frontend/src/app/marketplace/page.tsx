import type { Metadata } from 'next';

import { MarketplaceBrowser } from '@/components/marketplace/marketplace-browser';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { getMe } from '@/lib/auth';
import {
  getSelectedMarketplaceFilter,
  parseListingSearchParams,
  type SearchParamInput,
} from '@/lib/marketplace-format';
import { resolveOptionalUser } from '@/lib/optional-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Marketplace',
  description: "eFootball akkountlarini ko'rish va saralash.",
};

interface MarketplacePageProps {
  searchParams?: Promise<SearchParamInput>;
}

export default async function MarketplacePage({ searchParams }: MarketplacePageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const filters = parseListingSearchParams(resolvedSearchParams);
  const activeFilter = getSelectedMarketplaceFilter(resolvedSearchParams);
  const query = typeof resolvedSearchParams.q === 'string' ? resolvedSearchParams.q : undefined;
  const user = await resolveOptionalUser(getMe);

  return (
    <MarketplaceShell user={user}>
      <MarketplaceBrowser filters={filters} activeFilter={activeFilter} query={query} />
    </MarketplaceShell>
  );
}
