import type { Metadata } from 'next';

import { MarketplaceBrowser } from '@/components/marketplace/marketplace-browser';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { getMe } from '@/lib/auth';
import {
  getSelectedMarketplaceFilter,
  parseListingSearchParams,
  searchParamInputToSearchParams,
  type SearchParamInput,
} from '@/lib/marketplace-format';
import { getMarketplaceView } from '@/lib/marketplace-query';
import { browseListings } from '@/lib/marketplace-server';
import { resolveOptionalUser } from '@/lib/optional-auth';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 12;

export const metadata: Metadata = {
  title: 'eFootball akkount bozori',
  description:
    "Diviziyon, jamoa kuchi, tanga miqdori va narx bo'yicha eFootball akkountlarini toping. Sotuvchi bilan Telegram orqali bevosita bog'laning.",
  alternates: { canonical: '/marketplace' },
  openGraph: {
    title: 'eFootball akkount bozori | eFBazaar',
    description:
      "Diviziyon, jamoa kuchi va tanga miqdori bo'yicha eFootball akkountlarini toping — narxi ochiq, sotuvchi Telegram'da.",
    url: '/marketplace',
    type: 'website',
  },
};

interface MarketplacePageProps {
  searchParams?: Promise<SearchParamInput>;
}

export default async function MarketplacePage({ searchParams }: MarketplacePageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const rawParams = searchParamInputToSearchParams(resolvedSearchParams);
  const filters = parseListingSearchParams(resolvedSearchParams);
  if (filters.size === undefined) filters.size = PAGE_SIZE;

  const activeFilter = getSelectedMarketplaceFilter(resolvedSearchParams);
  const query = filters.search;
  const view = getMarketplaceView(rawParams);
  const rawQuery = rawParams.toString();

  const [user, result] = await Promise.all([
    resolveOptionalUser(getMe),
    browseListings(filters),
  ]);

  return (
    <MarketplaceShell
      user={user}
      activeTab="home"
      initialQuery={query}
      marketplaceQuery={rawQuery}
      collapsibleSearch
    >
      <MarketplaceBrowser
        filters={filters}
        activeFilter={activeFilter}
        query={query}
        result={result}
        rawQuery={rawQuery}
        view={view}
        authenticated={user !== null}
      />
    </MarketplaceShell>
  );
}
