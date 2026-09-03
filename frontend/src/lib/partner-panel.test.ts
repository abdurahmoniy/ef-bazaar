import { describe, expect, it } from 'vitest';

import {
  earnedFromPosts,
  formatSom,
  postStateLabel,
  priceWithinBounds,
  type PostRow,
} from './partner-panel';

const bounds = { minSom: 1000, maxSom: 100000 };

describe('priceWithinBounds', () => {
  it('accepts a price inside the admin bounds', () => {
    expect(priceWithinBounds(5000, bounds)).toBe(true);
  });

  it('rejects one below and one above', () => {
    expect(priceWithinBounds(500, bounds)).toBe(false);
    expect(priceWithinBounds(200000, bounds)).toBe(false);
  });

  it('accepts the bounds themselves', () => {
    expect(priceWithinBounds(1000, bounds)).toBe(true);
    expect(priceWithinBounds(100000, bounds)).toBe(true);
  });

  it('rejects a value that is not a number at all', () => {
    // Bo'sh maydon NaN beradi; uni "chegara ichida" deb hisoblasak,
    // server rad etadigan qiymat yuborilardi.
    expect(priceWithinBounds(Number.NaN, bounds)).toBe(false);
  });
});

describe('earnedFromPosts', () => {
  const post = (state: PostRow['state'], priceSom: number): PostRow => ({
    postId: state + priceSom,
    listingId: 'l',
    state,
    priceSom,
    createdAt: '2026-09-01T00:00:00Z',
    postedAt: null,
  });

  it('counts only what actually went out', () => {
    // Ushlangan pul hali hamkorniki emas — post chiqmasa qaytariladi.
    expect(earnedFromPosts([
      post('POSTED', 10000),
      post('POSTED', 5000),
      post('HELD', 15000),
      post('REFUNDED', 7000),
      post('AWAITING_FUNDS', 9000),
    ])).toBe(15000);
  });

  it('is zero when nothing has gone out', () => {
    expect(earnedFromPosts([post('HELD', 15000)])).toBe(0);
    expect(earnedFromPosts([])).toBe(0);
  });
});

describe('postStateLabel', () => {
  it('says what happened, not what the column says', () => {
    expect(postStateLabel('AWAITING_FUNDS')).toBe("To'lov kutilmoqda");
    expect(postStateLabel('POSTED')).toBe('Chiqdi');
    expect(postStateLabel('REFUNDED')).toBe('Qaytarildi');
  });

  it('falls back to the raw state rather than showing nothing', () => {
    // Backend yangi holat qo'shsa, panel bo'sh katak emas, xom qiymat
    // ko'rsatsin — u hech bo'lmasa nimadir deydi.
    expect(postStateLabel('SOMETHING_NEW' as PostRow['state'])).toBe('SOMETHING_NEW');
  });
});

describe('formatSom', () => {
  it('groups thousands', () => {
    expect(formatSom(1234567).replace(/\s/g, ' ')).toBe('1 234 567');
  });

  it('shows zero as zero, not as blank', () => {
    expect(formatSom(0)).toBe('0');
    expect(formatSom(null)).toBe('0');
  });
});
