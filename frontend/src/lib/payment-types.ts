/**
 * payment-service DTO mirrors. Every field name and every enum member here is
 * copied from `backend/payment-service/.../dto/*.java` — money is always
 * integer tiyin, never a float and never a formatted string.
 */

export interface WalletResponse {
  availableTiyin: number;
  heldTiyin: number;
  withdrawPendingTiyin: number;
  lifetimeDepositedTiyin: number;
  lifetimeEarnedTiyin: number;
}

export type InvoiceStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED';

export interface InvoiceResponse {
  id: string;
  /**
   * Full card number — the user cannot transfer without it. The invoice panel
   * is the only permitted place it may appear: never log it, never put it in
   * an error message, never hand it to analytics or error reporting.
   */
  pan: string;
  holderName: string;
  cardExpiry: string;
  /** What lands in the wallet. */
  requestedTiyin: number;
  /** What the user must actually send. Differs from requested when bumped. */
  transferTiyin: number;
  expiresAt: string;
  status: InvoiceStatus;
}

export type TransactionKind =
  | 'DEPOSIT'
  | 'TRADE_HOLD'
  | 'TRADE_SETTLE'
  | 'TRADE_RELEASE'
  | 'WITHDRAW_RESERVE'
  | 'WITHDRAW_FULFIL'
  | 'WITHDRAW_CANCEL'
  | 'ADJUSTMENT';

export type LedgerAccount =
  | 'PLATFORM_CARDS'
  | 'USER_AVAILABLE'
  | 'USER_HELD'
  | 'WITHDRAW_PENDING'
  | 'PLATFORM_REVENUE'
  | 'PLATFORM_FEES';

export interface WalletEntryResponse {
  transactionId: string;
  kind: TransactionKind;
  account: LedgerAccount;
  /** Ledger sign: negative credits the user. Flip it for display. */
  amountTiyin: number;
  createdAt: string;
}

export interface PlatformCardResponse {
  id: string;
  maskedPan: string;
  last4: string;
  holderName: string;
  expiryMonth: number;
  expiryYear: number;
  brand: 'VISA' | 'MC' | 'UZCARD' | 'HUMO';
  displayOrder: number;
  active: boolean;
  balanceTiyin?: number;
  balanceObservedAt?: string;
}

export interface ObservationResponse {
  id: string;
  cardLast4: string;
  amountTiyin: number;
  cardBalanceTiyin?: number;
  observedAt: string;
  rawText: string;
  status: 'MATCHED' | 'UNMATCHED' | 'MANUALLY_RESOLVED' | 'IGNORED';
}

export interface UserbotStatusResponse {
  healthy: boolean;
  lastSeenAt?: string;
  timeoutSeconds: number;
}

export interface TradeCommissionConfig {
  id: string;
  bandSom: number;
  lowRatePercent: number;
  highRatePercent: number;
  lowMinSom: number;
  highMinSom: number;
  active: boolean;
  updatedAt: string;
  updatedBy?: string;
}

export interface UpdateTradeCommissionConfigRequest {
  bandSom: number;
  lowRatePercent: number;
  highRatePercent: number;
  lowMinSom: number;
  highMinSom: number;
}
