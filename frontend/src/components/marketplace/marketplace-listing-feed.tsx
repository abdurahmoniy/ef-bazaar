'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { useMediaQuery } from '@/hooks/use-media-query';
import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';
import { buildListingSearchParams } from '@/lib/marketplace-format';
import { marketplaceHref, setMarketplacePage, type MarketplaceView } from '@/lib/marketplace-query';
import { normalizeMarketplaceQuery } from '@/lib/marketplace-scroll-state';
import type { ListingBrowseParams, ListingResponse, PageResponse } from '@/lib/marketplace-types';
import type { MarketplaceMode, MarketplaceTab } from '@/lib/marketplace-page-loader';
import type { PlayerMatchCriterion } from '@/lib/player-match-query';
import { useMarketplaceHistory } from './marketplace-history-provider';
import { MarketplaceScrollRestorer } from './marketplace-scroll-restorer';
import { ResponsiveListingGrid } from './responsive-listing-grid';
import { ListingsPagination } from './listings-pagination';

interface MarketplaceListingFeedProps {
  initialPage: PageResponse<ListingResponse>;
  filters: ListingBrowseParams;
  rawQuery: string;
  view: MarketplaceView;
  matchCriteria: PlayerMatchCriterion[];
  tab: MarketplaceTab;
  authenticated: boolean;
  mode: MarketplaceMode;
  profileHash?: string;
}

export function MarketplaceListingFeed(props: MarketplaceListingFeedProps) {
  // A changed search, filter, sort, or explicit page starts a separate feed.
  return <ListingFeed key={normalizeMarketplaceQuery(props.rawQuery)} {...props} />;
}

function ListingFeed({ initialPage, filters, rawQuery, view, matchCriteria }: MarketplaceListingFeedProps) {
  const mobile = useMediaQuery('(max-width: 639px)');
  const { feedCache, popstateMarker } = useMarketplaceHistory();
  const queryKey = normalizeMarketplaceQuery(rawQuery);
  const [pages, setPages] = useState<PageResponse<ListingResponse>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);
  const lastPage = pages.at(-1) ?? initialPage;
  const hasMore = lastPage.content.length > 0 && lastPage.page + 1 < lastPage.totalPages;

  useLayoutEffect(() => {
    if (popstateMarker?.queryKey !== queryKey) return;
    const cached = feedCache?.current.get(queryKey);
    if (cached) setPages(cached);
  }, [feedCache, popstateMarker, queryKey]);

  useEffect(() => {
    if (!mobile) setLoading(false);
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [mobile]);

  const loadNext = useCallback(async () => {
    if (!mobile || !hasMore || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(false);
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const nextPage = lastPage.page + 1;
      const params = buildListingSearchParams({ ...filters, page: nextPage, size: initialPage.size });
      const response = await fetch(buildMarketplaceApiPath('v1/listings', params), {
        credentials: 'include', cache: 'no-store', signal: controller.signal,
      });
      if (!response.ok) throw new Error('Listing page failed');
      const page = await response.json() as PageResponse<ListingResponse>;
      if (controller.signal.aborted) return;
      if (!Array.isArray(page.content) || page.page !== nextPage || !Number.isInteger(page.totalPages)) {
        throw new Error('Invalid listing page');
      }
      const nextPages = [...pages, page];
      setPages(nextPages);
      if (feedCache) {
        const cache = feedCache.current;
        cache.delete(queryKey);
        cache.set(queryKey, nextPages);
        // Retain recent feeds for Back without growing the cache per filter forever.
        if (cache.size > 5) cache.delete(cache.keys().next().value!);
      }
    } catch {
      // Aborted navigation must not update an obsolete feed. Timeouts remain retryable.
      if (request.current === controller) setError(true);
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  }, [feedCache, filters, hasMore, initialPage.size, lastPage.page, mobile, pages, queryKey]);

  useEffect(() => {
    if (!mobile || !hasMore || error || !sentinel.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) void loadNext();
    }, { rootMargin: '400px 0px' });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [error, hasMore, loadNext, mobile]);

  const seen = new Set<string>();
  const listings = (mobile ? [initialPage, ...pages] : [initialPage])
    .flatMap(page => page.content)
    .filter(listing => {
      if (seen.has(listing.id)) return false;
      seen.add(listing.id);
      return true;
    });

  return (
    <>
      <ResponsiveListingGrid listings={listings} view={view} rawQuery={rawQuery} matchCriteria={matchCriteria} />
      <MarketplaceScrollRestorer rawQuery={rawQuery} listingIds={listings.map(listing => listing.id)} />
      {mobile ? (
        <div ref={sentinel} className="flex min-h-16 flex-col items-center justify-center gap-2 py-4">
          <p role="status" className="text-center text-xs text-muted-foreground">
            {loading ? <span className="inline-flex items-center gap-2"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />Yuklanmoqda…</span>
              : error ? 'E‘lonlarni yuklay olmadik. Qayta urinib ko‘ring.'
                : !hasMore ? 'Barcha e‘lonlar ko‘rsatildi.' : null}
          </p>
          {hasMore && !loading && (
            <button type="button" data-load-more onClick={() => void loadNext()}
              className="min-h-11 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground">
              {error ? 'Qayta urinish' : 'Yana ko‘rsatish'}
            </button>
          )}
        </div>
      ) : (
        <ListingsPagination page={initialPage.page} totalPages={initialPage.totalPages}
          buildHref={page => marketplaceHref(setMarketplacePage(new URLSearchParams(rawQuery), page))} />
      )}
    </>
  );
}
