import type { Metadata } from 'next';

import { MarketplaceBrowser } from '@/components/marketplace/marketplace-browser';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { InvitationCard } from '@/components/growth/invitation-card';
import { getMe } from '@/lib/auth';
import {
  getSelectedMarketplaceFilter,
  parseListingSearchParams,
  searchParamInputToSearchParams,
  type SearchParamInput,
} from '@/lib/marketplace-format';
import { MARKETPLACE_DEFAULT_PAGE_SIZE } from '@/lib/marketplace-page-loader';
import { loadMarketplacePageResult } from '@/lib/marketplace-page-server';
import { getMarketplaceFeedHash, getMarketplaceTab, getMarketplaceView } from '@/lib/marketplace-query';
import { resolveOptionalUser } from '@/lib/optional-auth';

export const dynamic = 'force-dynamic';
// Browser route reuse only; authenticated server requests remain uncached.
export const unstable_dynamicStaleTime = 30;

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
  if (filters.size === undefined) filters.size = MARKETPLACE_DEFAULT_PAGE_SIZE;

  const activeFilter = getSelectedMarketplaceFilter(resolvedSearchParams);
  const query = filters.search;
  const view = getMarketplaceView(rawParams);
  const rawQuery = rawParams.toString();

  // Tab foydalanuvchiga bog'liq (mehmon — doim Katta bozor), shuning uchun avval u.
  const user = await resolveOptionalUser(getMe);
  const authenticated = user !== null;
  const tab = getMarketplaceTab(rawParams, authenticated);
  const load = await loadMarketplacePageResult({
    filters, tab, authenticated, feedHash: getMarketplaceFeedHash(rawParams),
  });

  return (
    <MarketplaceShell
      user={user}
      activeTab="home"
      initialQuery={query}
      marketplaceQuery={rawQuery}
    >
      <MarketplaceBrowser
        filters={filters}
        activeFilter={activeFilter}
        query={query}
        load={load}
        tab={tab}
        rawQuery={rawQuery}
        view={view}
        authenticated={authenticated}
      />
      {load.ok && load.data.page.content.length > 0 && <InvitationCard placement="marketplace" compact dismissible />}
    </MarketplaceShell>
  );
}
