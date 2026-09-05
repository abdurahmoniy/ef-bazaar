import { describe, expect, it } from 'vitest';

import type { PartnerApplication, PartnerApplicationStatus } from './partners';
import {
  canOpenPartnerPanel,
  moveBlock,
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


describe('canOpenPartnerPanel', () => {
  function application(status: PartnerApplicationStatus): PartnerApplication {
    return {
      id: 'a1',
      userId: 'u1',
      status,
      channelId: -1001234,
      channelTitle: 'Efootball Uz',
      channelUsername: 'efootball_uz',
      subscriberCount: 50239,
      verifiedAt: null,
      verificationError: null,
      invoiceId: null,
      paidAt: null,
      reviewedAt: null,
      reviewNote: null,
      cancelReason: null,
      cancelledAt: null,
      createdAt: '2026-09-01T00:00:00Z',
    };
  }

  it('opens for an approved partner whatever their role is', () => {
    // Roles are single-valued, so an admin who partners never receives
    // ROLE_PARTNER — the grant deliberately leaves ADMIN untouched so
    // they keep the admin panel. Gating on the role locked them out of
    // a panel the API was already serving them.
    expect(canOpenPartnerPanel(application('APPROVED'))).toBe(true);
  });

  it('stays shut while the application is still moving', () => {
    // Paid but unreviewed is not a partnership. Opening here would show
    // a channel that does not exist yet.
    expect(canOpenPartnerPanel(application('AWAITING_REVIEW'))).toBe(false);
    expect(canOpenPartnerPanel(application('AWAITING_PAYMENT'))).toBe(false);
    expect(canOpenPartnerPanel(application('AWAITING_CHANNEL'))).toBe(false);
  });

  it('stays shut once the partnership has ended', () => {
    expect(canOpenPartnerPanel(application('REJECTED'))).toBe(false);
    expect(canOpenPartnerPanel(application('CANCELLED'))).toBe(false);
  });

  it('stays shut when there is no application at all', () => {
    // Also the marketplace-is-down case: the panel's own data comes
    // from that service, so there is nothing to draw either way.
    expect(canOpenPartnerPanel(null)).toBe(false);
  });
});


describe('moveBlock', () => {
  const blocks = ['PRICE', 'STRENGTH', 'DESCRIPTION'] as const;

  it('swaps neighbours so a partner can lift the description to the top', () => {
    // Some channels lead with the seller's words, others with the
    // numbers. One fixed order cannot serve both.
    expect(moveBlock([...blocks], 2, -1)).toEqual(['PRICE', 'DESCRIPTION', 'STRENGTH']);
    expect(moveBlock([...blocks], 0, 1)).toEqual(['STRENGTH', 'PRICE', 'DESCRIPTION']);
  });

  it('refuses to move past either end instead of wrapping around', () => {
    // Wrapping would send the top item to the bottom on a mis-click,
    // and the partner would not connect the click to the result.
    expect(moveBlock([...blocks], 0, -1)).toEqual([...blocks]);
    expect(moveBlock([...blocks], 2, 1)).toEqual([...blocks]);
  });

  it('leaves the original array untouched', () => {
    // The caller holds it in React state; mutating it in place would
    // skip the re-render and the list would look stuck.
    const original = [...blocks];
    moveBlock(original, 0, 1);
    expect(original).toEqual([...blocks]);
  });

  it('ignores an index that is not in the list', () => {
    expect(moveBlock([...blocks], 9, -1)).toEqual([...blocks]);
    expect(moveBlock([...blocks], -1, 1)).toEqual([...blocks]);
  });
});
