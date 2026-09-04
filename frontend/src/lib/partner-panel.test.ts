import { describe, expect, it } from 'vitest';

import {
  describeTerms,
  earnedFromPosts,
  formatSom,
  postStateLabel,
  isValidPostPrice,
  type PostRow,
} from './partner-panel';

describe('isValidPostPrice', () => {
  it('accepts zero — a free channel is a real choice', () => {
    expect(isValidPostPrice(0)).toBe(true);
  });

  it('accepts any positive price, with no ceiling', () => {
    // Narx hamkorning o'z ishi. Qimmat kanal shunchaki tanlanmaydi.
    expect(isValidPostPrice(5000)).toBe(true);
    expect(isValidPostPrice(10_000_000)).toBe(true);
  });

  it('rejects a negative price', () => {
    // Manfiy narx narx emas — u sotuvchiga pul to'lash bo'lardi.
    expect(isValidPostPrice(-1)).toBe(false);
  });

  it('rejects a value that is not a number at all', () => {
    // Bo'sh maydon NaN beradi; uni yaroqli deb hisoblasak, server
    // rad etadigan qiymat yuborilardi.
    expect(isValidPostPrice(Number.NaN)).toBe(false);
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

describe('describeTerms', () => {
  it('names the percentage and where it is taken from', () => {
    // "10%" o'zi yetarli emas: nimadan olinishini bilmagan hamkor
    // savdo summasidan deb o'ylaydi va raqamni katta kutadi.
    expect(describeTerms({ mode: 'PERCENT', tradePercent: 10, fixedMonthlySom: 0 }))
      .toBe("Har savdodan 10% (efBazaar komissiyasidan)");
  });

  it('names only the monthly amount in fixed mode', () => {
    // Ikki rejim bir-birini almashtiradi. Ikkalasini birga
    // ko'rsatsak, hamkor ikkalasini ham olaman deb o'ylardi.
    expect(describeTerms({ mode: 'FIXED', tradePercent: 0, fixedMonthlySom: 300000 }))
      .toContain('Oyiga');
    expect(describeTerms({ mode: 'FIXED', tradePercent: 0, fixedMonthlySom: 300000 }))
      .not.toContain('%');
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
