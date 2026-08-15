import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SellerCard } from './seller-card';
import type { SellerSummary } from '@/lib/marketplace-types';

describe('SellerCard', () => {
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
      telegramUsername: 'cr7_official',
      telegramPhotoUrl: '/api/auth/v1/users/123e4567-e89b-12d3-a456-426614174000/photo',
      verified: true,
      createdAt: '2025-05-10T12:00:00Z',
    };

    const html = renderToStaticMarkup(
      createElement(SellerCard, { seller: summary, isViewerOwner: false }),
    );

    expect(html).toContain('Cristiano Ronaldo');
    expect(html).toContain('@cr7_official');
    expect(html).toContain('tasdiqlangan');
    expect(html).toContain("A&#x27;zo: 2025");
    expect(html).toContain('https://t.me/cr7_official');
    expect(html).toContain('Telegramda yozish');
  });

  it('hides Telegramda yozish button when viewer is the owner', () => {
    const summary: SellerSummary = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      displayName: 'Seller Me',
      telegramUsername: 'sellerme',
      verified: false,
      createdAt: '2024-01-01T00:00:00Z',
    };

    const html = renderToStaticMarkup(
      createElement(SellerCard, { seller: summary, isViewerOwner: true }),
    );

    expect(html).toContain('Seller Me');
    expect(html).not.toContain('Telegramda yozish');
    expect(html).toContain('tasdiqlanmagan');
  });
});
