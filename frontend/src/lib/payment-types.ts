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
  | 'PARTNER_FEE'
  | 'REFERRAL_REWARD'
  | 'PARTNER_POST_HOLD'
  | 'PARTNER_POST_SETTLE'
  | 'PARTNER_POST_REFUND'
  | 'PARTNER_TRADE_SHARE'
  | 'PARTNER_MONTHLY'
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

  /**
   * Kim, kimga, qachon va nima uchun.
   *
   * <p>Faqat identifikatorlar keladi — ismlarni adminka `users/by-ids`
   * orqali o'zi yechadi, payment-service auth bilan gaplashmaydi.
   */
  resolvedBy?: string | null;
  resolvedUserId?: string | null;
  resolvedAt?: string | null;
  resolutionNote?: string | null;
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

/**
 * One transaction kind's effect on the platform's equity.
 *
 * Both figures arrive POSITIVE — the backend flips the ledger's sign so this
 * screen never has to. `inTiyin` grew the platform's own money, `outTiyin`
 * spent it.
 */
export interface RevenueFlowRow {
  kind: TransactionKind;
  inTiyin: number;
  outTiyin: number;
}

/**
 * Money that has settled on one card.
 *
 * Not profit: commission is posted against the trade that earned it and carries
 * no card, so no per-card profit exists in the data. This is the pipe's volume.
 */
export interface CardThroughputRow {
  cardId: string;
  throughputTiyin: number;
  paidInvoices: number;
}

/**
 * The finance dashboard's single read. Every amount is tiyin, and every one is
 * already in the direction a person reads it.
 */
export interface PaymentAnalyticsOverview {
  /** What the ledger says is on the cards. */
  ledgerCardsTiyin: number;
  /** What the userbot last saw there. Short by `unobservedCards` cards. */
  observedCardsTiyin: number;
  unobservedCards: number;

  userAvailableTiyin: number;
  userHeldTiyin: number;
  userWithdrawPendingTiyin: number;
  /** The three above: what the platform owes its users. */
  usersTotalTiyin: number;
  /** `ledgerCards − usersTotal`. Negative while referral spending runs ahead. */
  platformOwnTiyin: number;

  revenueInTiyin: number;
  revenueOutTiyin: number;
  feesTiyin: number;
  /** `revenueIn − revenueOut − fees`. A negative value is a business state, not an alert. */
  netTiyin: number;
  referralRewardTiyin: number;
  referralPayouts: number;
  referralRecipients: number;
  revenueByKind: RevenueFlowRow[];

  cardThroughput: CardThroughputRow[];
  computedAt: string;
}

/**
 * One movement on a platform card, whichever way it went.
 *
 * `amountTiyin` is always positive — the direction is a field, never a sign, so
 * nothing here can negate it twice. Credits and debits live in separate tables
 * on the backend (a debit must never reach the credit reconciliation queue,
 * where it could be attributed to a user and create money); this is the merged
 * read of both.
 */
export interface CardMovement {
  id: string;
  direction: 'IN' | 'OUT';
  cardLast4: string;
  amountTiyin: number;
  /** Debits only, and only when the bank's notice stated one. */
  commissionTiyin?: number;
  /** What the card held afterwards, when the notice said. */
  cardBalanceTiyin?: number;
  /** Debits only: the bank's own words for where the money went. */
  description?: string;
  /** Credits only: MATCHED, UNMATCHED, MANUALLY_RESOLVED or IGNORED. */
  creditStatus?: string;
  /**
   * Debits only: whether the card is one the platform owns. Absent on a credit
   * — that table records a card by its last four digits and nothing else, so
   * there is nothing to answer it from.
   */
  ownCard?: boolean;
  observedAt: string;
}
