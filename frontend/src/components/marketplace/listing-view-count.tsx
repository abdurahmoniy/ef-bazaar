'use client';

import { useEffect, useRef, useState } from 'react';
import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';

interface ListingViewCountProps {
  listingId: string;
  initialCount: number;
  track: boolean;
}

export function ListingViewCount({ listingId, initialCount, track }: ListingViewCountProps) {
  const [recorded, setRecorded] = useState<{ listingId: string; count: number } | null>(null);
  const request = useRef<{ listingId: string; result: Promise<{ viewCount: number }> } | null>(null);

  useEffect(() => {
    if (!track) return;
    let active = true;

    // Reuse the request during Strict Mode's effect replay so one page open
    // does not count twice. This runs only after the detail page mounts.
    if (request.current?.listingId !== listingId) {
      request.current = {
        listingId,
        result: fetch(buildMarketplaceApiPath(['v1', 'listings', listingId, 'views']), {
          method: 'POST',
        }).then((response) => {
          if (!response.ok) throw new Error('View could not be recorded');
          return response.json();
        }),
      };
    }

    request.current.result.then(({ viewCount }) => {
      if (active && Number.isSafeInteger(viewCount) && viewCount >= 0) {
        setRecorded({ listingId, count: viewCount });
      }
    }).catch(() => {
      // Keep the saved count if tracking fails; the listing stays usable.
    });

    return () => { active = false; };
  }, [listingId, track]);

  return (
    <p className="mt-1 text-xs text-muted-foreground">
      Ko'rishlar: {recorded?.listingId === listingId ? recorded.count : initialCount}
    </p>
  );
}
