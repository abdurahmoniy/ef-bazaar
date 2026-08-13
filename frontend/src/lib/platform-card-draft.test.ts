import { describe, expect, it } from 'vitest';

import {
  formatHolderInput,
  reviewPlatformCardDraft,
  type PlatformCardDraft,
} from './platform-card-draft';

/** A HUMO PAN that passes Luhn — the same one card-detect.test.ts uses. */
const HUMO_PAN = '9860 0000 0000 0000';

/** Fixed clock: August 2026. Expiry is judged against this, never `Date.now()`. */
const NOW = new Date('2026-08-13T10:00:00Z');

function draft(overrides: Partial<PlatformCardDraft> = {}): PlatformCardDraft {
  return {
    pan: HUMO_PAN,
    holderName: 'EFBAZAAR MCHJ',
    expiryMonth: '12',
    expiryYear: '29',
    ...overrides,
  };
}

describe('formatHolderInput', () => {
  it('upper-cases as the admin types, matching what the backend stores', () => {
    expect(formatHolderInput('efbazaar mchj')).toBe('EFBAZAAR MCHJ');
  });

  it('caps at the 64 characters the backend accepts', () => {
    expect(formatHolderInput('a'.repeat(80))).toBe('A'.repeat(64));
  });
});

describe('reviewPlatformCardDraft — the PAN', () => {
  it('accepts a complete HUMO number and reports the brand', () => {
    const review = reviewPlatformCardDraft(draft(), NOW);
    expect(review.brand).toBe('HUMO');
    expect(review.panValid).toBe(true);
    expect(review.panMessage).toBe('HUMO');
  });

  it('asks for a number before anything is typed', () => {
    const review = reviewPlatformCardDraft(draft({ pan: '' }), NOW);
    expect(review.brand).toBeNull();
    expect(review.panValid).toBe(false);
    expect(review.panMessage).toBe('Humo yoki Uzcard raqamini kiriting');
  });

  it('waits for the rest of the digits instead of crying wrong mid-typing', () => {
    const review = reviewPlatformCardDraft(draft({ pan: '9860 00' }), NOW);
    expect(review.brand).toBe('HUMO');
    expect(review.panValid).toBe(false);
    expect(review.panMessage).toBe("HUMO — raqamni to'liq kiriting");
  });

  it('rejects a full-length number whose check digit is wrong', () => {
    const review = reviewPlatformCardDraft(draft({ pan: '8600 0000 0000 0000' }), NOW);
    expect(review.brand).toBe('UZCARD');
    expect(review.panValid).toBe(false);
    expect(review.panMessage).toBe("UZCARD — raqam noto'g'ri");
  });

  /**
   * payment-service's `CardBrand.detect` throws on an unknown BIN, which comes
   * back as a 500 rather than a validation error. The form must not let that
   * request leave the browser.
   */
  it('refuses a BIN no supported brand claims', () => {
    const review = reviewPlatformCardDraft(draft({ pan: '6011 0000 0000 0004' }), NOW);
    expect(review.brand).toBeNull();
    expect(review.panValid).toBe(false);
    expect(review.panMessage).toBe("Karta turini aniqlab bo'lmadi");
    expect(review.canSubmit).toBe(false);
  });

  it('never repeats the number back inside a message', () => {
    for (const pan of ['9860 0000 0000 000', '6011 0000 0000 0004', '8600 0000 0000 0000']) {
      const review = reviewPlatformCardDraft(draft({ pan }), NOW);
      expect(review.panMessage).not.toContain('0000');
      expect(review.panMessage).not.toContain('9860');
    }
  });
});

describe('reviewPlatformCardDraft — the holder', () => {
  it('requires a name', () => {
    const review = reviewPlatformCardDraft(draft({ holderName: '   ' }), NOW);
    expect(review.holderValid).toBe(false);
    expect(review.canSubmit).toBe(false);
  });
});

describe('reviewPlatformCardDraft — the expiry', () => {
  it('expands a two-digit year the way the card face is printed', () => {
    const review = reviewPlatformCardDraft(draft({ expiryMonth: '3', expiryYear: '29' }), NOW);
    expect(review.expiryValid).toBe(true);
    expect(review.request).toEqual({
      pan: '9860000000000000',
      holderName: 'EFBAZAAR MCHJ',
      expiryMonth: 3,
      expiryYear: 2029,
    });
  });

  it('takes a four-digit year as written', () => {
    const review = reviewPlatformCardDraft(draft({ expiryYear: '2029' }), NOW);
    expect(review.request?.expiryYear).toBe(2029);
  });

  it('stays quiet while the fields are still empty', () => {
    const review = reviewPlatformCardDraft(draft({ expiryMonth: '', expiryYear: '' }), NOW);
    expect(review.expiryValid).toBe(false);
    expect(review.expiryMessage).toBeNull();
  });

  it('rejects a month outside 1-12', () => {
    const review = reviewPlatformCardDraft(draft({ expiryMonth: '13' }), NOW);
    expect(review.expiryValid).toBe(false);
    expect(review.expiryMessage).toBe("Oy 1 dan 12 gacha bo'lishi kerak");
  });

  it('rejects a year that is neither two nor four digits', () => {
    const review = reviewPlatformCardDraft(draft({ expiryYear: '203' }), NOW);
    expect(review.expiryValid).toBe(false);
    expect(review.expiryMessage).toBe('Yilni kiriting — masalan 29 yoki 2029');
  });

  /** The backend column is @Min(2000) @Max(2100). */
  it('rejects a year the backend would refuse', () => {
    const review = reviewPlatformCardDraft(draft({ expiryYear: '2101' }), NOW);
    expect(review.expiryValid).toBe(false);
    expect(review.expiryMessage).toBe('Yilni kiriting — masalan 29 yoki 2029');
  });

  it('rejects a card that has already expired', () => {
    const review = reviewPlatformCardDraft(draft({ expiryMonth: '7', expiryYear: '26' }), NOW);
    expect(review.expiryValid).toBe(false);
    expect(review.expiryMessage).toBe("Karta muddati o'tgan");
  });

  it('accepts the month the card expires in — it is good until its last day', () => {
    const review = reviewPlatformCardDraft(draft({ expiryMonth: '8', expiryYear: '26' }), NOW);
    expect(review.expiryValid).toBe(true);
    expect(review.expiryMessage).toBeNull();
  });
});

describe('reviewPlatformCardDraft — submission', () => {
  it('builds the request only when every field is good', () => {
    const review = reviewPlatformCardDraft(draft(), NOW);
    expect(review.canSubmit).toBe(true);
    expect(review.request).toEqual({
      pan: '9860000000000000',
      holderName: 'EFBAZAAR MCHJ',
      expiryMonth: 12,
      expiryYear: 2029,
    });
  });

  it('sends the trimmed, upper-cased holder the backend stores', () => {
    const review = reviewPlatformCardDraft(draft({ holderName: '  efbazaar mchj  ' }), NOW);
    expect(review.request?.holderName).toBe('EFBAZAAR MCHJ');
  });

  it('sends digits only, however the admin spaced the number', () => {
    const review = reviewPlatformCardDraft(draft({ pan: '9860-0000-0000-0000' }), NOW);
    expect(review.request?.pan).toBe('9860000000000000');
  });

  it('withholds the request while any field is bad', () => {
    for (const bad of [{ pan: '1234' }, { holderName: '' }, { expiryMonth: '0' }, { expiryYear: '' }]) {
      const review = reviewPlatformCardDraft(draft(bad), NOW);
      expect(review.canSubmit).toBe(false);
      expect(review.request).toBeNull();
    }
  });
});
