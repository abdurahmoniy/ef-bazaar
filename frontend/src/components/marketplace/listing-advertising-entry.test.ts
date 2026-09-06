import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/marketplace-actions', () => ({ deleteListing: vi.fn() }));
vi.mock('./listing-media-gallery', () => ({ ListingMediaGallery: () => createElement('div', { 'data-testid': 'listing-media' }) }));
vi.mock('./listing-actions', () => ({ ListingActions: () => null }));
vi.mock('./listing-card', () => ({ ListingCard: () => createElement('div', null, 'Listing card') }));
vi.mock('./seller-card', () => ({ SellerCard: () => null }));
vi.mock('./share-listing-button', () => ({ ShareListingButton: () => null }));

import { MarketplaceListingDetail } from './marketplace-listing-detail';
import { ProfileListings } from '@/components/profile/profile-listings';
import type { ListingResponse, ListingStatus } from '@/lib/marketplace-types';
import type { User } from '@/lib/types';

const listing: ListingResponse = {
  id: 'listing-1', sellerId: 'owner', description: 'Epic Messi', price: 100_000,
  priceNegotiable: false, attributes: {}, mediaMessageIds: [], status: 'ACTIVE',
  forwardCount: 0, likeCount: 0, createdAt: '2026-09-06T00:00:00Z', updatedAt: '2026-09-06T00:00:00Z',
};
const owner: User = {
  id: 'owner', displayName: 'Owner', telegramLinked: true, googleLinked: false,
  verified: false, roles: [], createdAt: '2026-09-06T00:00:00Z',
};
const destination = 'href="/marketplace/listing-1/advertise"';

function detail(viewer: User | null, status: ListingStatus = 'ACTIVE') {
  return renderToStaticMarkup(createElement(MarketplaceListingDetail, {
    listing: { ...listing, status }, viewer, seller: null, similarListings: [],
  }));
}

describe('owner advertising entry points', () => {
  it('offers the active owner one advertising entry before the listing media', () => {
    const html = detail(owner);
    expect(html.split(destination)).toHaveLength(2);
    expect(html.indexOf(destination)).toBeLessThan(html.indexOf('data-testid="listing-media"'));
  });

  it.each([null, { ...owner, id: 'buyer' }])('does not show an owner promotion to guests or buyers', (viewer) => {
    expect(detail(viewer)).not.toContain(destination);
  });

  it.each(['SOLD', 'DELETED'] as const)('does not show promotion for an owner’s %s listing', (status) => {
    expect(detail(owner, status)).not.toContain(destination);
  });

  it('puts advertising before edit and delete in My listings', () => {
    const html = renderToStaticMarkup(createElement(ProfileListings, { listings: [listing] }));
    expect(html).toContain(destination);
    expect(html.indexOf(destination)).toBeLessThan(html.indexOf('href="/marketplace/listing-1/edit"'));
    expect(html).toContain('Tahrirlash');
    expect(html).toContain('O&#x27;chirish');
  });

  it.each(['SOLD', 'DELETED'] as const)('keeps %s listings editable without an advertising entry', (status) => {
    const html = renderToStaticMarkup(createElement(ProfileListings, { listings: [{ ...listing, status }] }));
    expect(html).not.toContain(destination);
    expect(html).toContain('href="/marketplace/listing-1/edit"');
  });

  it('does not show owner actions among favorites', () => {
    const html = renderToStaticMarkup(createElement(ProfileListings, { listings: [listing], favorites: true }));
    expect(html).not.toContain(destination);
    expect(html).not.toContain('href="/marketplace/listing-1/edit"');
  });
});
