'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import * as React from 'react';

import {
  detailBackMarkerFromPending,
  detailMarkerState,
  MARKETPLACE_PENDING_STORAGE_KEY,
  readFeedMarker,
  type MarketplaceFeedMarker,
} from '@/lib/marketplace-scroll-state';

interface MarketplaceHistoryContextValue {
  popstateMarker: MarketplaceFeedMarker | null;
  clearPopstateMarker: () => void;
}

const MarketplaceHistoryContext = React.createContext<MarketplaceHistoryContextValue>({
  popstateMarker: null,
  clearPopstateMarker: () => undefined,
});

export function MarketplaceHistoryProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const [popstateMarker, setPopstateMarker] = React.useState<MarketplaceFeedMarker | null>(null);

  React.useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.sessionStorage.getItem(MARKETPLACE_PENDING_STORAGE_KEY);
      if (!raw) return;

      const currentHref = `${pathname}${search ? `?${search}` : ''}`;
      const marker = detailBackMarkerFromPending(raw, currentHref, Date.now());
      if (marker) {
        window.history.replaceState(
          detailMarkerState(window.history.state, marker),
          '',
          currentHref,
        );
      }
    } finally {
      if (raw !== null) {
        try {
          window.sessionStorage.removeItem(MARKETPLACE_PENDING_STORAGE_KEY);
        } catch {
          // Storage may be disabled; navigation must remain usable.
        }
      }
    }
  }, [pathname, search]);

  React.useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      setPopstateMarker(readFeedMarker(event.state));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const clearPopstateMarker = React.useCallback(() => setPopstateMarker(null), []);
  const value = React.useMemo(
    () => ({ popstateMarker, clearPopstateMarker }),
    [clearPopstateMarker, popstateMarker],
  );

  return (
    <MarketplaceHistoryContext.Provider value={value}>
      {children}
    </MarketplaceHistoryContext.Provider>
  );
}

export function useMarketplaceHistory() {
  return React.useContext(MarketplaceHistoryContext);
}
