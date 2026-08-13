import { formatListingDate } from './marketplace-format';
import { formatTiyin } from './money';
import type { LedgerAccount, TransactionKind, WalletEntryResponse } from './payment-types';

export const WALLET_KIND_LABELS: Record<TransactionKind, string> = {
  DEPOSIT: "To'ldirish",
  TRADE_HOLD: 'Savdoda muzlatildi',
  TRADE_SETTLE: 'Savdodan tushdi',
  TRADE_RELEASE: 'Savdodan qaytdi',
  WITHDRAW_RESERVE: 'Yechishga ajratildi',
  WITHDRAW_FULFIL: 'Yechib berildi',
  WITHDRAW_CANCEL: 'Yechish bekor qilindi',
  ADJUSTMENT: 'Admin tuzatishi',
};

/** Shown when payment-service grows a kind this frontend build predates. */
const UNKNOWN_KIND_LABEL = 'Amaliyot';

export interface WalletHistoryRow {
  transactionId: string;
  label: string;
  /** Display sign, already flipped: positive is money arriving. */
  signedTiyin: number;
  /** Ready to render: `+100 000` / `-50 000`. */
  amount: string;
  when: string;
  incoming: boolean;
}

/** `+100 000` / `-50 000`. Zero carries no sign. */
export function formatSignedTiyin(signedTiyin: number): string {
  if (signedTiyin === 0) return formatTiyin(0);
  const sign = signedTiyin > 0 ? '+' : '-';
  return `${sign}${formatTiyin(Math.abs(signedTiyin))}`;
}

/**
 * Ledger entries into rows a user can read.
 *
 * Two things happen here. The sign is flipped — the ledger writes a credit to
 * the user as negative, and a deposit must read `+100 000`. And the list is
 * narrowed to one account: a hold writes both a USER_AVAILABLE debit and a
 * USER_HELD credit, and showing both makes one action look like two. The held
 * and withdraw-pending totals are already visible as balances above.
 */
export function walletHistoryRows(
  entries: WalletEntryResponse[],
  account: LedgerAccount = 'USER_AVAILABLE',
): WalletHistoryRow[] {
  return entries
    .filter((entry) => entry.account === account)
    .map((entry) => {
      const signedTiyin = -entry.amountTiyin;
      return {
        transactionId: entry.transactionId,
        label: WALLET_KIND_LABELS[entry.kind] ?? UNKNOWN_KIND_LABEL,
        signedTiyin,
        amount: formatSignedTiyin(signedTiyin),
        when: formatListingDate(entry.createdAt),
        incoming: signedTiyin > 0,
      };
    });
}
