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
  PARTNER_FEE: 'Hamkorlik to‘lovi',
  REFERRAL_REWARD: 'Referal bonus',
  PARTNER_POST_HOLD: 'Kanal posti uchun muzlatildi',
  // walletEntryLabel yo'nalishga qarab almashtiradi.
  PARTNER_POST_SETTLE: 'Kanal posti uchun',
  PARTNER_POST_REFUND: 'Kanal posti chiqmadi — qaytdi',
  PARTNER_TRADE_SHARE: 'Hamkorlik (savdodan)',
  PARTNER_MONTHLY: 'Hamkorlik (oylik)',
  PLAN_PURCHASE: 'Tarif xaridi',
  ADJUSTMENT: 'Admin tuzatishi',
};

/** Shown when payment-service grows a kind this frontend build predates. */
const UNKNOWN_KIND_LABEL = 'Amaliyot';

/**
 * Money crossing the wallet's boundary, or moving inside it.
 *
 * A hold does not cost anything — it moves so'm from the spendable pile to the
 * frozen one, both of which are the owner's. Printing it as `-5 000` next to
 * the settle's `-5 000` made one 5 000 so'm trade read as 10 000 so'm gone.
 */
export type WalletMovement = 'in' | 'out' | 'internal';

/** Kinds that only shuffle the owner's own buckets. */
const INTERNAL_KINDS: ReadonlySet<TransactionKind> = new Set<TransactionKind>([
  'TRADE_HOLD',           // available → held
  'TRADE_RELEASE',        // held → available
  'WITHDRAW_RESERVE',     // available → withdraw-pending
  'WITHDRAW_CANCEL',      // withdraw-pending → available
  'PARTNER_POST_HOLD',    // available → held (sotuvchining o'zida)
  'PARTNER_POST_REFUND',  // held → available (sotuvchining o'zida)
]);

export interface WalletHistoryRow {
  tradeHref: string | null;
  transactionId: string;
  /** Ikon SHU maydondan tanlanadi — matn bo'lagidan emas. */
  kind: TransactionKind;
  label: string;
  /** Display sign, already flipped: positive is money arriving. */
  signedTiyin: number;
  /** Ready to render: `+100 000`, `-50 000`, or `5 000` when internal. */
  amount: string;
  when: string;
  incoming: boolean;
  movement: WalletMovement;
}

export function movementOf(kind: TransactionKind, incoming: boolean): WalletMovement {
  if (INTERNAL_KINDS.has(kind)) return 'internal';
  return incoming ? 'in' : 'out';
}

/** `+100 000` / `-50 000`. Zero carries no sign. */
export function formatSignedTiyin(signedTiyin: number): string {
  if (signedTiyin === 0) return formatTiyin(0);
  const sign = signedTiyin > 0 ? '+' : '-';
  return `${sign}${formatTiyin(Math.abs(signedTiyin))}`;
}

/**
 * Names a settle from the side the reader is on.
 *
 * The buyer and the seller share one transaction and read it oppositely: the
 * money leaves one wallet and lands in the other. "Savdodan tushdi" on the
 * paying side would say their escrow came back to them.
 */
export function walletEntryLabel(kind: TransactionKind, incoming: boolean): string {
  if (kind === 'TRADE_SETTLE') {
    return incoming ? 'Savdodan tushdi' : "Sotuvchiga o'tkazildi";
  }
  // Xuddi shu sabab: post haqi sotuvchidan chiqib hamkorga kiradi.
  // Ikkalasiga bir xil matn ko'rsatsak, hamkor o'z daromadini
  // xarajat deb o'qirdi.
  if (kind === 'PARTNER_POST_SETTLE') {
    return incoming ? 'Hamkorlik (kanal posti)' : 'Kanal posti uchun';
  }
  return WALLET_KIND_LABELS[kind] ?? UNKNOWN_KIND_LABEL;
}

/**
 * Ledger entries into rows a user can read.
 *
 * The sign is flipped — the ledger writes a credit to the user as negative, and
 * a deposit must read `+100 000`.
 *
 * One row per transaction, preferring the spendable-balance leg. A hold writes
 * both a USER_AVAILABLE debit and a USER_HELD credit, and showing both makes
 * one action look like two — but filtering to USER_AVAILABLE outright dropped
 * the event the buyer most needs to see. A settle credits the seller's
 * USER_AVAILABLE and only touches the buyer's USER_HELD, so the buyer's history
 * ended at "Savdoda muzlatildi" and stayed there: the money left the visible
 * list with nothing to say where it went. A release writes both legs, which is
 * why the same hole never showed on a cancelled trade.
 */
export function walletHistoryRows(
  entries: WalletEntryResponse[],
  account: LedgerAccount = 'USER_AVAILABLE',
): WalletHistoryRow[] {
  const perTransaction = new Map<string, WalletEntryResponse[]>();
  for (const entry of entries) {
    const group = perTransaction.get(entry.transactionId);
    if (group) group.push(entry);
    else perTransaction.set(entry.transactionId, [entry]);
  }

  // Per transaction: the spendable-balance legs if there are any, otherwise
  // whatever legs this user has. Keeps every leg of the preferred account
  // rather than one, so a transaction that ever posts twice to it stays
  // fully visible.
  const visible = [...perTransaction.values()].flatMap((group) => {
    const preferred = group.filter((entry) => entry.account === account);
    return preferred.length > 0 ? preferred : group;
  });

  return visible.map((entry) => {
    const signedTiyin = -entry.amountTiyin;
    const incoming = signedTiyin > 0;
    const movement = movementOf(entry.kind, incoming);
    return {
      transactionId: entry.transactionId,
      tradeHref: ['TRADE_HOLD', 'TRADE_SETTLE', 'TRADE_RELEASE'].includes(entry.kind)
        && entry.tradeId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.tradeId)
        ? `/hamyon/savdo/${entry.tradeId}` : null,
      kind: entry.kind,
      label: walletEntryLabel(entry.kind, incoming),
      signedTiyin,
      // No sign on an internal move: the owner still has the money, and a
      // minus here is read as a loss on top of the one that follows it.
      amount: movement === 'internal'
        ? formatTiyin(Math.abs(signedTiyin))
        : formatSignedTiyin(signedTiyin),
      when: formatListingDate(entry.createdAt),
      incoming,
      movement,
    };
  });
}
