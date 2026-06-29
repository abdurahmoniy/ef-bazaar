import type { Metadata } from 'next';

import { ListingCard } from '@/components/marketplace/listing-card';
import { ListingFilters } from '@/components/marketplace/listing-filters';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { ApiException } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { browseListings } from '@/lib/marketplace';
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

  try {
    const listings = await browseListings(filters);

    return (
      <MarketplaceShell user={user}>
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-cyber-cyan">Marketplace</p>
              <h1 className="mt-1 text-2xl font-black text-white">Akkountlar</h1>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              {listings.totalElements} ta
            </div>
          </div>

          <ListingFilters activeFilter={activeFilter} query={query} />

          {listings.content.length === 0 ? (
            <EmptyState title="E'lon topilmadi" body="Boshqa filtr yoki qidiruvni sinab ko'ring." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {listings.content.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
        </section>
      </MarketplaceShell>
    );
  } catch (error) {
    return (
      <MarketplaceShell user={user}>
        <EmptyState
          title="Marketplace yuklanmadi"
          body={error instanceof ApiException ? error.message : "E'lonlarni olishda xatolik bo'ldi."}
        />
      </MarketplaceShell>
    );
  }
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-card/80 px-4 py-12 text-center">
      <h2 className="text-base font-bold text-white">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
