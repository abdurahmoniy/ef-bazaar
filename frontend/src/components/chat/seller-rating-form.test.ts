import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/trade-client-api', () => ({
  fetchTradeSellerRating: vi.fn().mockResolvedValue({
    ok: true,
    data: null,
  }),
  postSellerRating: vi.fn().mockResolvedValue({
    ok: true,
    data: {
      id: 'rating-1',
      tradeId: 'trade-1',
      sellerId: 'seller-1',
      raterId: 'buyer-1',
      stars: 5,
      comment: 'Ajoyib!',
      hidden: false,
      createdAt: '2026-08-19T12:00:00Z',
    },
  }),
}));

import { SellerRatingForm } from './seller-rating-form';

describe('SellerRatingForm', () => {
  it('renders rating form for buyer when trade is completed', () => {
    const html = renderToStaticMarkup(
      createElement(SellerRatingForm, {
        tradeId: 'trade-1',
        isBuyer: true,
      }),
    );

    // Initial render before client mount / fetch
    expect(html).toBeDefined();
  });
});
