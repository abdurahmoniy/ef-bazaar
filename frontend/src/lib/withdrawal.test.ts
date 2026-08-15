import { describe, expect, it } from 'vitest';

import {
  formatPan,
  MIN_WITHDRAWAL_TIYIN,
  normalizeHolderName,
  validateDraft,
  type WithdrawalDraft,
} from './withdrawal';

const draft = (over: Partial<WithdrawalDraft> = {}): WithdrawalDraft => ({
  amountTiyin: 5_000_000,
  pan: '8600 1234 5678 9010',
  holderName: 'ALI VALIYEV',
  phone: '+998 90 123 45 67',
  ...over,
});

describe('validateDraft', () => {
  it('accepts a complete draft the wallet can cover', () => {
    expect(validateDraft(draft(), 10_000_000)).toBeNull();
  });

  it('refuses more than the wallet holds', () => {
    // The server refuses too; this only saves the round trip.
    expect(validateDraft(draft({ amountTiyin: 20_000_000 }), 10_000_000))
      .toBe('amount-over-balance');
  });

  it('allows withdrawing the entire balance', () => {
    // What the "hammasi" button fills in — an off-by-one here would make it
    // fill a value its own form then rejects.
    expect(validateDraft(draft({ amountTiyin: 10_000_000 }), 10_000_000)).toBeNull();
  });

  it('refuses an amount under the floor', () => {
    expect(validateDraft(draft({ amountTiyin: MIN_WITHDRAWAL_TIYIN - 1 }), 10_000_000))
      .toBe('amount-too-small');
  });

  it('refuses a card that is not 16 digits', () => {
    expect(validateDraft(draft({ pan: '8600 1234 5678' }), 10_000_000)).toBe('pan-not-16');
  });

  it('counts digits, not spacing', () => {
    expect(validateDraft(draft({ pan: '8600123456789010' }), 10_000_000)).toBeNull();
  });

  it('needs a holder name', () => {
    expect(validateDraft(draft({ holderName: ' ' }), 10_000_000)).toBe('holder-missing');
  });

  it('needs a phone number', () => {
    expect(validateDraft(draft({ phone: '12' }), 10_000_000)).toBe('phone-missing');
  });
});

describe('normalizeHolderName', () => {
  it('uppercases, because the database checks it', () => {
    expect(normalizeHolderName('ali valiyev')).toBe('ALI VALIYEV');
  });

  it('drops anything that is not a latin name', () => {
    expect(normalizeHolderName('Али Valiyev123')).toBe('VALIYEV');
  });

  it('collapses runs of spaces but lets one be typed', () => {
    expect(normalizeHolderName('ali   valiyev')).toBe('ALI VALIYEV');
    expect(normalizeHolderName('ali ')).toBe('ALI ');
  });
});

describe('formatPan', () => {
  it('groups in fours', () => {
    expect(formatPan('8600123456789010')).toBe('8600 1234 5678 9010');
  });

  it('stops at 16 digits', () => {
    expect(formatPan('86001234567890109999')).toBe('8600 1234 5678 9010');
  });

  it('leaves a partial group alone', () => {
    expect(formatPan('860012')).toBe('8600 12');
  });
});
