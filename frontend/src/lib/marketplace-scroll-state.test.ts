import { describe, expect, it } from 'vitest';

import {
  detailBackMarkerFromPending,
  feedMarkerState,
  normalizeMarketplaceQuery,
  readDetailBackMarker,
  readFeedMarker,
  restorationTarget,
  sameMarketplaceHref,
} from './marketplace-scroll-state';

describe('marketplace feed history', () => {
  it('normalizes reordered and repeated query entries deterministically', () => {
    const left = 'view=grid&matchCard=b&matchCard=a&q=Messi';
    const right = 'q=Messi&matchCard=a&view=grid&matchCard=b';

    expect(normalizeMarketplaceQuery(left)).toBe(normalizeMarketplaceQuery(right));
  });

  it('merges marker state without dropping Next private fields', () => {
    const state = feedMarkerState({ __NA: true, tree: ['x'] }, {
      version: 1,
      kind: 'marketplace-feed',
      queryKey: 'q=Messi',
      listingId: 'listing-1',
      scrollY: 640,
      feedHref: '/marketplace?q=Messi',
    });

    expect(state).toMatchObject({ __NA: true, tree: ['x'] });
    expect(readFeedMarker(state)?.listingId).toBe('listing-1');
  });

  it('finalizes only a fresh pending navigation whose target matches detail', () => {
    const pending = JSON.stringify({
      version: 1,
      targetHref: '/marketplace/listing-1?q=Messi',
      createdAt: 1000,
      feed: {
        version: 1,
        kind: 'marketplace-feed',
        queryKey: 'q=Messi',
        listingId: 'listing-1',
        scrollY: 640,
        feedHref: '/marketplace?q=Messi',
      },
    });

    const marker = detailBackMarkerFromPending(
      pending,
      '/marketplace/listing-1?q=Messi',
      1500,
    );
    expect(marker?.previousFeedHref).toBe('/marketplace?q=Messi');
    expect(detailBackMarkerFromPending(
      pending,
      '/marketplace/listing-2?q=Messi',
      1500,
    )).toBeNull();
    expect(detailBackMarkerFromPending(
      pending,
      '/marketplace/listing-1?q=Messi',
      7000,
    )).toBeNull();
    expect(readDetailBackMarker({})).toBeNull();
  });

  it('restores only on popstate, preferring anchor then clamped pixels', () => {
    const marker = {
      version: 1 as const,
      kind: 'marketplace-feed' as const,
      queryKey: 'q=Messi',
      listingId: 'listing-1',
      scrollY: 900,
      feedHref: '/marketplace?q=Messi',
    };

    expect(restorationTarget(marker, 'q=Messi', 'push', true, 1200)).toBeNull();
    expect(restorationTarget(marker, 'q=Messi', 'popstate', true, 1200)).toEqual({
      kind: 'anchor',
      listingId: 'listing-1',
    });
    expect(restorationTarget(marker, 'q=Messi', 'popstate', false, 600)).toEqual({
      kind: 'pixel',
      top: 600,
    });
  });

  it('rejects protocol-relative, encoded-path, and query-mismatched feed markers', () => {
    const base = {
      version: 1 as const,
      kind: 'marketplace-feed' as const,
      queryKey: '',
      listingId: 'listing-1',
      scrollY: 0,
    };

    expect(readFeedMarker(feedMarkerState({}, {
      ...base,
      feedHref: '//evil.example/marketplace',
    }))).toBeNull();
    expect(readFeedMarker(feedMarkerState({}, {
      ...base,
      feedHref: '/marketplace%2fsecret',
    }))).toBeNull();
    expect(sameMarketplaceHref('/marketplace?q=x', '//evil.example/marketplace?q=x'))
      .toBe(false);
    expect(sameMarketplaceHref('/marketplace?q=x', '/marketplace?q=y')).toBe(false);
  });
});
