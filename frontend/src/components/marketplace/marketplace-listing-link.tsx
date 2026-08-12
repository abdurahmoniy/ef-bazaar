'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  feedMarkerState,
  MARKETPLACE_PENDING_STORAGE_KEY,
  normalizeMarketplaceQuery,
  type MarketplaceFeedMarker,
  type MarketplacePendingNavigation,
} from '@/lib/marketplace-scroll-state';

interface MarketplaceListingLinkProps {
  listingId: string;
  href: string;
  rawQuery?: string;
  trackFeedNavigation?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * The feed's only listing-navigation boundary. Task 12 can add restoration
 * tracking here without coupling it to any of the card's visual layouts.
 */
export function MarketplaceListingLink({
  listingId,
  href,
  rawQuery = '',
  trackFeedNavigation = false,
  className,
  children,
}: MarketplaceListingLinkProps) {
  const query = rawQuery.replace(/^\?+/, '');
  const destination = query ? `${href}${href.includes('?') ? '&' : '?'}${query}` : href;

  return (
    <Link
      href={destination}
      className={className}
      data-marketplace-listing-link={listingId}
      onNavigate={trackFeedNavigation ? () => {
        const feedHref = `${window.location.pathname}${window.location.search}`;
        const feed: MarketplaceFeedMarker = {
          version: 1,
          kind: 'marketplace-feed',
          queryKey: normalizeMarketplaceQuery(rawQuery),
          listingId,
          scrollY: Math.max(0, window.scrollY),
          feedHref,
        };
        const pending: MarketplacePendingNavigation = {
          version: 1,
          targetHref: destination,
          createdAt: Date.now(),
          feed,
        };

        try {
          window.history.replaceState(feedMarkerState(window.history.state, feed), '', feedHref);
        } catch {
          // A hardened WebView may reject state writes; never block the link.
        }
        try {
          window.sessionStorage.setItem(
            MARKETPLACE_PENDING_STORAGE_KEY,
            JSON.stringify(pending),
          );
        } catch {
          // Private browsing can reject storage; normal navigation still works.
        }
      } : undefined}
    >
      {children}
    </Link>
  );
}
