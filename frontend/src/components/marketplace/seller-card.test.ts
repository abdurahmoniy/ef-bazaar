import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SellerCard } from './seller-card';
import type { SellerSummary } from '@/lib/marketplace-types';

describe('SellerCard', () => {
  it('never links to the seller\'s Telegram, even if a stale payload still carries a handle', () => {
    // Aloqa faqat efBazaar chati orqali: to'g'ridan-to'g'ri Telegram havolasi
    // xaridorni garovsiz savdoga olib ketardi.
    const legacy = {
      id: 'seller-1', displayName: 'Seller', telegramUsername: 'seller',
      verified: false, createdAt: '2025-01-01T00:00:00Z',
    } as SellerSummary;
    const html = renderToStaticMarkup(createElement(SellerCard, { seller: legacy }));

    expect(html).not.toContain('t.me/');
    expect(html).not.toContain('@seller');
    expect(html).toContain('/users/seller-1');
  });

  it('renders fallback when seller is null', () => {
    const html = renderToStaticMarkup(
      createElement(SellerCard, { seller: null }),
    );
    expect(html).toContain("Sotuvchi ma&#x27;lumotlari yuklanmadi.");
  });

  it('renders seller details with SellerSummary data for guest/other user', () => {
    const summary: SellerSummary = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      displayName: 'Cristiano Ronaldo',
      telegramPhotoUrl: '/api/auth/v1/users/123e4567-e89b-12d3-a456-426614174000/photo',
      verified: true,
      createdAt: '2025-05-10T12:00:00Z',
    };

    const html = renderToStaticMarkup(
      createElement(SellerCard, { seller: summary }),
    );

    expect(html).toContain('Cristiano Ronaldo');
    expect(html).toContain('tasdiqlangan');
    expect(html).toContain("A&#x27;zo: 2025");
    expect(html).toContain('/users/123e4567-e89b-12d3-a456-426614174000');
    expect(html).toContain("Profilni ko&#x27;rish");
    expect(html).not.toContain('Telegramda yozish');
  });

  it('renders rating summary metrics when present', () => {
    const summary: SellerSummary = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      displayName: 'Top Seller',
      verified: true,
      createdAt: '2025-01-01T00:00:00Z',
    };

    const html = renderToStaticMarkup(
      createElement(SellerCard, {
        seller: summary,
        ratingSummary: {
          sellerId: summary.id,
          averageRating: 4.8,
          ratingCount: 15,
          ratingSum: 72,
          starCounts: { 5: 12, 4: 3, 3: 0, 2: 0, 1: 0 },
        },
      }),
    );

    expect(html).toContain('4.8');
    expect(html).toContain('15 baho');
  });
});
