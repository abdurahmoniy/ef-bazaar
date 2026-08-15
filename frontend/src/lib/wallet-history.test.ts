import { describe, expect, it } from 'vitest';

import type { WalletEntryResponse } from './payment-types';
import {
  WALLET_KIND_LABELS,
  formatSignedTiyin,
  walletHistoryRows,
} from './wallet-history';

/** Explicit escape — never assert a literal invisible character. See money.test.ts. */
const NBSP = '\u00A0';

function entry(overrides: Partial<WalletEntryResponse> = {}): WalletEntryResponse {
  return {
    transactionId: '11111111-1111-4111-8111-111111111111',
    kind: 'DEPOSIT',
    account: 'USER_AVAILABLE',
    // The ledger's own sign: negative credits the user.
    amountTiyin: -10_000_000,
    createdAt: '2026-08-13T09:00:00Z',
    ...overrides,
  };
}

describe('formatSignedTiyin', () => {
  it('shows an arriving amount as a plus', () => {
    expect(formatSignedTiyin(10_000_000)).toBe(`+100${NBSP}000`);
  });

  it('shows a leaving amount as a minus', () => {
    expect(formatSignedTiyin(-10_000_000)).toBe(`-100${NBSP}000`);
  });

  it('treats zero as neither', () => {
    expect(formatSignedTiyin(0)).toBe('0');
  });
});

describe('walletHistoryRows', () => {
  it('flips the ledger sign so a deposit reads as money arriving', () => {
    const [row] = walletHistoryRows([entry()]);
    expect(row.signedTiyin).toBe(10_000_000);
    expect(row.amount).toBe(`+100${NBSP}000`);
    expect(row.incoming).toBe(true);
  });

  it('reads a debit as money leaving', () => {
    const [row] = walletHistoryRows([
      entry({ kind: 'TRADE_HOLD', amountTiyin: 5_000_000 }),
    ]);
    expect(row.signedTiyin).toBe(-5_000_000);
    expect(row.amount).toBe(`-50${NBSP}000`);
    expect(row.incoming).toBe(false);
  });

  it('labels every transaction kind in Uzbek', () => {
    expect(WALLET_KIND_LABELS.DEPOSIT).toBe("To'ldirish");
    expect(WALLET_KIND_LABELS.TRADE_HOLD).toBe('Savdoda muzlatildi');
    expect(WALLET_KIND_LABELS.TRADE_SETTLE).toBe('Savdodan tushdi');
    expect(WALLET_KIND_LABELS.TRADE_RELEASE).toBe('Savdodan qaytdi');
    expect(WALLET_KIND_LABELS.WITHDRAW_RESERVE).toBe('Yechishga ajratildi');
    expect(WALLET_KIND_LABELS.WITHDRAW_FULFIL).toBe('Yechib berildi');
    expect(WALLET_KIND_LABELS.WITHDRAW_CANCEL).toBe('Yechish bekor qilindi');
    expect(WALLET_KIND_LABELS.ADJUSTMENT).toBe('Admin tuzatishi');
  });

  it('puts the label on the row', () => {
    const [row] = walletHistoryRows([entry({ kind: 'ADJUSTMENT' })]);
    expect(row.label).toBe('Admin tuzatishi');
  });

  it('falls back to a neutral label for a kind this build does not know', () => {
    const unknown = entry({ kind: 'SOMETHING_NEW' as WalletEntryResponse['kind'] });
    expect(walletHistoryRows([unknown])[0].label).toBe('Amaliyot');
  });

  it('keeps only the spendable account so one hold is not two rows', () => {
    const rows = walletHistoryRows([
      entry({ account: 'USER_AVAILABLE', amountTiyin: 5_000_000 }),
      entry({ account: 'USER_HELD', amountTiyin: -5_000_000 }),
      entry({ account: 'PLATFORM_REVENUE', amountTiyin: -10_000 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].signedTiyin).toBe(-5_000_000);
  });

  it('renders the timestamp in Tashkent time', () => {
    const [row] = walletHistoryRows([entry({ createdAt: '2026-08-13T09:00:00Z' })]);
    expect(row.when).toBe('13 avgust 14:00');
  });

  it('survives an empty history', () => {
    expect(walletHistoryRows([])).toEqual([]);
  });
});

/**
 * The buyer's side of a completed trade.
 *
 * A settle credits the seller's USER_AVAILABLE and only touches the buyer's
 * USER_HELD. Filtering the history to USER_AVAILABLE therefore dropped the
 * event entirely: the buyer's last word on their own money stayed "Savdoda
 * muzlatildi" long after it had gone to the seller. A release writes both legs,
 * which is why a cancelled trade never showed the hole.
 */
describe('walletHistoryRows — a trade that completed', () => {
  const HOLD_TX = '22222222-2222-4222-8222-222222222222';
  const SETTLE_TX = '33333333-3333-4333-8333-333333333333';

  const buyerHistory = (): WalletEntryResponse[] => [
    // Newest first, as the endpoint returns them.
    entry({
      transactionId: SETTLE_TX,
      kind: 'TRADE_SETTLE',
      account: 'USER_HELD',
      amountTiyin: 5_000_000,          // held drains
      createdAt: '2026-08-14T10:00:00Z',
    }),
    entry({
      transactionId: HOLD_TX,
      kind: 'TRADE_HOLD',
      account: 'USER_AVAILABLE',
      amountTiyin: 5_000_000,          // available drops
      createdAt: '2026-08-13T09:00:00Z',
    }),
    entry({
      transactionId: HOLD_TX,
      kind: 'TRADE_HOLD',
      account: 'USER_HELD',
      amountTiyin: -5_000_000,         // held rises
      createdAt: '2026-08-13T09:00:00Z',
    }),
  ];

  it('shows the settle instead of ending at the hold', () => {
    const rows = walletHistoryRows(buyerHistory());

    expect(rows.map((r) => r.transactionId)).toEqual([SETTLE_TX, HOLD_TX]);
  });

  it('says where the money went, not that it is still frozen', () => {
    const [settle] = walletHistoryRows(buyerHistory());

    expect(settle.label).toBe("Sotuvchiga o'tkazildi");
    expect(settle.incoming).toBe(false);
  });

  it('still collapses the hold into one row', () => {
    // The reason the filter existed: two legs of one action must not read as
    // two separate things happening to the wallet.
    const rows = walletHistoryRows(buyerHistory());

    expect(rows.filter((r) => r.transactionId === HOLD_TX)).toHaveLength(1);
    expect(rows.find((r) => r.transactionId === HOLD_TX)?.label)
      .toBe('Savdoda muzlatildi');
  });

  it('reads the same transaction as income on the seller side', () => {
    const [row] = walletHistoryRows([
      entry({
        transactionId: SETTLE_TX,
        kind: 'TRADE_SETTLE',
        account: 'USER_AVAILABLE',
        amountTiyin: -4_625_000,       // seller is credited
      }),
    ]);

    expect(row.label).toBe('Savdodan tushdi');
    expect(row.incoming).toBe(true);
  });

  it('still shows a cancelled trade coming back', () => {
    const [row] = walletHistoryRows([
      entry({
        transactionId: SETTLE_TX,
        kind: 'TRADE_RELEASE',
        account: 'USER_AVAILABLE',
        amountTiyin: -5_000_000,
      }),
    ]);

    expect(row.label).toBe('Savdodan qaytdi');
  });
});

