import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/app/auth/actions', () => ({ linkTelegramAction: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { ListingActions } from './listing-actions';

describe('ListingActions', () => {
  it('renders owner actions including Tahrirlash and Sotildi deb belgilash when ACTIVE', () => {
    const html = renderToStaticMarkup(
      createElement(ListingActions, {
        listingId: 'listing-1',
        authenticated: true,
        isOwner: true,
        initialLikeCount: 5,
        status: 'ACTIVE',
      }),
    );

    expect(html).toContain('Tahrirlash');
    expect(html).toContain('Sotildi deb belgilash');
    expect(html).toContain('/marketplace/listing-1/edit');
  });

  it('renders owner SOLD state when status is SOLD', () => {
    const html = renderToStaticMarkup(
      createElement(ListingActions, {
        listingId: 'listing-1',
        authenticated: true,
        isOwner: true,
        initialLikeCount: 5,
        status: 'SOLD',
      }),
    );

    expect(html).toContain("Ushbu e&#x27;lon sotilgan");
    expect(html).not.toContain('Sotildi deb belgilash');
  });

  it('renders buyer SOLD state when viewing a sold listing', () => {
    const html = renderToStaticMarkup(
      createElement(ListingActions, {
        listingId: 'listing-1',
        authenticated: true,
        isOwner: false,
        initialLikeCount: 12,
        status: 'SOLD',
      }),
    );

    expect(html).toContain("Ushbu e&#x27;lon sotilgan");
    expect(html).toContain("Sotuvchi bilan aloqa yopilgan.");
    expect(html).not.toContain("Sotuvchi bilan bog&#x27;lanish");
  });

  it('renders buyer active state with contact and like buttons', () => {
    const html = renderToStaticMarkup(
      createElement(ListingActions, {
        listingId: 'listing-1',
        authenticated: true,
        isOwner: false,
        initialLikeCount: 12,
        status: 'ACTIVE',
      }),
    );

    expect(html).toContain("Sotuvchi bilan bog&#x27;lanish");
    expect(html).toContain('Shikoyat');
  });
});
