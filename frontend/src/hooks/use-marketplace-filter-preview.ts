'use client';

import * as React from 'react';
import { fetchMarketplaceResultCount } from '@/lib/marketplace-preview';
import type { MarketplaceFilterDraft } from '@/lib/marketplace-filter-draft';

type PreviewState = { status: 'idle' | 'loading' | 'error' } | { status: 'success'; count: number };

export function useMarketplaceFilterPreview(rawQuery: string, draft: MarketplaceFilterDraft, enabled: boolean, authenticated = false) {
  const [preview, setPreview] = React.useState<PreviewState>({ status: 'idle' });
  React.useEffect(() => {
    setPreview({ status: 'idle' });
    if (!enabled) return;
    let current = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setPreview({ status: 'loading' });
      fetchMarketplaceResultCount(new URLSearchParams(rawQuery), draft, controller.signal, authenticated)
        .then((count) => { if (current) setPreview({ status: 'success', count }); })
        .catch((error: unknown) => {
          if (current && (error as Error).name !== 'AbortError') setPreview({ status: 'error' });
        });
    }, 300);
    return () => {
      current = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [rawQuery, draft, enabled, authenticated]);
  return preview;
}
