'use client';

import * as React from 'react';

import { useMarketplaceHistory } from '@/components/marketplace/marketplace-history-provider';
import { restorationTarget } from '@/lib/marketplace-scroll-state';

export function MarketplaceScrollRestorer({
  rawQuery,
  listingIds,
}: {
  rawQuery: string;
  listingIds: string[];
}) {
  const { popstateMarker, clearPopstateMarker } = useMarketplaceHistory();
  const listingKey = listingIds.join('\u0000');

  React.useLayoutEffect(() => {
    if (!popstateMarker) return;

    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const anchor = document.getElementById(
          `marketplace-listing-${popstateMarker.listingId}`,
        );
        const maxScrollY = Math.max(
          0,
          document.documentElement.scrollHeight - window.innerHeight,
        );
        const target = restorationTarget(
          popstateMarker,
          rawQuery,
          'popstate',
          Boolean(anchor),
          maxScrollY,
        );

        if (target?.kind === 'anchor' && anchor) {
          anchor.scrollIntoView({ block: 'start' });
        } else if (target?.kind === 'pixel') {
          window.scrollTo({ top: target.top });
        }
        clearPopstateMarker();
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [clearPopstateMarker, listingKey, popstateMarker, rawQuery]);

  return null;
}
