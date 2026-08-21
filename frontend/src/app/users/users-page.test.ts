import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/users/123e4567-e89b-12d3-a456-426614174000',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
}));

vi.mock('@/lib/gamer-server', () => ({
  getGamerCard: vi.fn().mockResolvedValue({
    userId: '123e4567-e89b-12d3-a456-426614174000',
    displayName: 'Lionel Messi',
    telegramUsername: 'leomessi',
    verified: true,
    memberSince: '2024-03-01T00:00:00Z',
    photoAvailable: false,
    elo: 1450,
    tier: 'ELITE',
    wins: 30,
    draws: 5,
    losses: 2,
    matchesCount: 37,
    winRatePercent: 81,
    tournaments: 4,
    activeListings: 2,
    soldListings: 8,
    escrowPurchases: 3,
    blacklisted: false,
    bio: 'Professional eFootball player',
    platform: 'MOBILE',
    favoriteTeam: 'FC Barcelona',
  }),
  isUserBlacklisted: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/marketplace-server', () => ({
  getUserListings: vi.fn().mockResolvedValue([
    {
      id: 'listing-1',
      sellerId: '123e4567-e89b-12d3-a456-426614174000',
      description: 'Stacked epics account',
      price: 250000,
      priceNegotiable: true,
      attributes: {},
      mediaMessageIds: [],
      status: 'ACTIVE',
      forwardCount: 0,
      likeCount: 15,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
  ]),
}));

vi.mock('@/lib/auth', () => ({
  getMe: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/trade-server', () => ({
  getSellerRatingSummary: vi.fn().mockResolvedValue({
    sellerId: '123e4567-e89b-12d3-a456-426614174000',
    averageRating: 4.9,
    ratingCount: 8,
    ratingSum: 39,
    starCounts: { 5: 7, 4: 1, 3: 0, 2: 0, 1: 0 },
  }),
  getSellerRatings: vi.fn().mockResolvedValue([
    {
      id: 'rating-1',
      tradeId: 'trade-101',
      sellerId: '123e4567-e89b-12d3-a456-426614174000',
      raterId: 'rater-1',
      raterDisplayName: 'Buyer Bob',
      raterUsername: 'buyer_bob',
      raterPhotoUrl: null,
      stars: 5,
      comment: 'Super tez va ishonchli!',
      hidden: false,
      createdAt: '2025-01-10T12:00:00Z',
    },
  ]),
}));

import UserProfilePage from './[id]/page';

describe('UserProfilePage', () => {
  it('renders public profile with user details, stats and listings', async () => {
    const jsx = await UserProfilePage({
      params: Promise.resolve({ id: '123e4567-e89b-12d3-a456-426614174000' }),
    });

    const html = renderToStaticMarkup(jsx);

    expect(html).toContain('Lionel Messi');
    expect(html).toContain('@leomessi');
    expect(html).toContain('tasdiqlangan');
    expect(html).toContain('Reyting');
    expect(html).toContain('4.9');
    expect(html).toContain("Faol e&#x27;lonlar");
    expect(html).toContain('Sotilgan');
    expect(html).toContain('100% Xavfsiz');
    expect(html).toContain('Kafillik tizimi');
    expect(html).toContain('Stacked epics account');
    expect(html).toContain('Xaridorlar fikrlari');
    expect(html).toContain('Buyer Bob');
    expect(html).toContain('Super tez va ishonchli!');
  });
});
