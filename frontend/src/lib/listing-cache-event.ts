'use client';

import type { LikeToggleResponse } from './marketplace-types';

const LISTING_LIKE_CHANGED = 'marketplace:listing-like-changed';

export function publishListingLikeChange(result: LikeToggleResponse) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<LikeToggleResponse>(LISTING_LIKE_CHANGED, { detail: result }));
}

export function subscribeListingLikeChanges(onChange: (result: LikeToggleResponse) => void) {
  const listener = (event: Event) => onChange((event as CustomEvent<LikeToggleResponse>).detail);
  window.addEventListener(LISTING_LIKE_CHANGED, listener);
  return () => window.removeEventListener(LISTING_LIKE_CHANGED, listener);
}
