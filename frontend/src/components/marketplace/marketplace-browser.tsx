'use client';

import { useEffect, useState } from 'react';

import { ListingCard } from '@/components/marketplace/listing-card';
import { ListingFilters } from '@/components/marketplace/listing-filters';
import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';
import {
  buildListingSearchParams,
  type MarketplaceFilterId,
} from '@/lib/marketplace-format';
import type {
  ListingBrowseParams,
  ListingResponse,
  PageResponse,
} from '@/lib/marketplace-types';

interface MarketplaceBrowserProps {
  filters: ListingBrowseParams;
  activeFilter: MarketplaceFilterId;
  query?: string;
}

export function MarketplaceBrowser({ filters, activeFilter, query }: MarketplaceBrowserProps) {
  const [listings, setListings] = useState<PageResponse<ListingResponse> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const queryString = buildListingSearchParams(filters).toString();

  useEffect(() => {
    const controller = new AbortController();

    async function loadListings() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams(queryString);
        const response = await fetch(buildMarketplaceApiPath('v1/listings', params), {
          headers: { Accept: 'application/json' },
          credentials: 'include',
          signal: controller.signal,
        });
        const payload = await readJson(response);

        if (!response.ok) {
          setError(errorMessageFromPayload(payload, "E'lonlarni olishda xatolik bo'ldi."));
          setListings(null);
          return;
        }

        setListings(payload as PageResponse<ListingResponse>);
      } catch (loadError) {
        if ((loadError as Error).name !== 'AbortError') {
          setError("E'lonlarni olishda xatolik bo'ldi.");
          setListings(null);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadListings();
    return () => controller.abort();
  }, [queryString]);

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-cyber-cyan">Marketplace</p>
          <h1 className="mt-1 text-2xl font-black text-white">Akkountlar</h1>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {loading ? '...' : `${listings?.totalElements ?? 0} ta`}
        </div>
      </div>

      <ListingFilters activeFilter={activeFilter} query={query} />

      {loading ? (
        <EmptyState title="Yuklanmoqda..." body="Marketplace ma'lumotlari olinmoqda." />
      ) : error ? (
        <EmptyState title="Marketplace yuklanmadi" body={error} />
      ) : !listings || listings.content.length === 0 ? (
        <EmptyState title="E'lon topilmadi" body="Boshqa filtr yoki qidiruvni sinab ko'ring." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {listings.content.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </section>
  );
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isRecord(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === 'object' && payload !== null;
}

function errorMessageFromPayload(payload: unknown, fallback: string) {
  if (!isRecord(payload)) return fallback;
  if (typeof payload.message === 'string') return payload.message;
  if (typeof payload.error === 'string') return payload.error;
  return fallback;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-card/80 px-4 py-12 text-center">
      <h2 className="text-base font-bold text-white">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
