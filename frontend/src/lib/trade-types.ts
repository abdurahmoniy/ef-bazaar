/**
 * Types mirroring trade-service DTOs (Java records). Shapes match:
 *   - uz.efbazaar.trade.trade.dto.TradeResponse
 *   - uz.efbazaar.trade.trade.dto.ProposalResponse
 *   - uz.efbazaar.trade.card.dto.CardResponse
 */

export type TradeState =
  | 'INITIATED'
  | 'WAITING_ADMIN'
  | 'IN_PROGRESS'
  | 'WAITING_CLOSE_CONFIRM'
  | 'WAITING_PAYMENT'
  | 'WAITING_EMAIL_CHANGE'
  | 'VERIFYING_KONAMI_LINK'
  | 'WAITING_PASSWORD'
  | 'WAITING_BUYER_VERIFY'
  | 'SUCCESS'
  | 'REJECTED'
  | 'ORPHANED';

export type ParticipantRole = 'SELLER' | 'BUYER';
export type TradeMode = 'SMART' | 'HUMAN';
export type HumanTradeState = 'WAITING_ADMIN' | 'IN_PROGRESS' | 'WAITING_CLOSE_CONFIRM';

/** What is being exchanged. Absent on responses from before swaps shipped. */
export type TradeKind = 'SALE' | 'SWAP' | 'SWAP_SURCHARGE';

export interface TradeSideProgress {
  role: ParticipantRole;
  emailChanged: boolean;
  konamiVerified: boolean;
  passwordSent: boolean;
  confirmed: boolean;
  rejected: boolean;
  lastStepAt: string | null;
}

export interface TradeResponse {
  id: string;
  state: TradeState;
  kind?: TradeKind | null;
  /**
   * Both parties' progress. A swap advances only when both have cleared a
   * step, so this is what tells each party what the other is waiting on.
   */
  sides?: TradeSideProgress[] | null;
  /**
   * Address of the account this viewer is RECEIVING. Same as `mailboxEmail` on
   * a sale; on a swap it is the other party's, because the boxes cross over.
   */
  counterpartMailboxEmail?: string | null;
  /** Added by the human-admin feature. Older backend DTOs may omit it. */
  mode?: TradeMode | null;
  sellerId: string;
  buyerId: string;
  priceUzs: number;
  assignedAdminId?: string | null;
  adminFeeUzs?: number | null;
  escalatedAt?: string | null;
  escalationReason?: string | null;
  sellerConfirmedAt?: string | null;
  buyerConfirmedAt?: string | null;
  completedAt?: string | null;
  mailboxId: string | null;
  /**
   * Escrow-mailbox address; the seller pastes this into Konami during
   * WAITING_EMAIL_CHANGE. `null` while INITIATED (worker hasn't returned
   * the real address yet).
   */
  mailboxEmail: string | null;
  chatId: string | null;
  createdAt: string;
  expiresAt: string | null;
  stateDeadline: string | null;
  role: ParticipantRole | null;
  /**
   * Set once the seller has sent the Konami password — the buyer POSTs
   * `/trades/{id}/messages/{passwordMessageId}/reveal` to unlock it once.
   * `null` before WAITING_BUYER_VERIFY.
   */
  passwordMessageId: string | null;
  /**
   * Konami email-change verification code (6 digits) detected in the escrow
   * mailbox. Gates the "Email o'zgartirdim" button in WAITING_EMAIL_CHANGE.
   * `null` until the code arrives; ~5-min Konami TTL is not enforced here.
   */
  emailChangeVerificationCode: string | null;
}

/** Mirrors uz.efbazaar.trade.trade.dto.TradePage. */
export interface TradePage {
  items: TradeResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface ProposalResponse {
  proposalId: string;
  expiresAt: string;
}

/**
 * Full snapshot of a pending proposal, returned by
 * `GET /api/v1/trades/proposals?chatId=...`. Mirrors
 * `uz.efbazaar.trade.trade.dto.ProposalDetailsResponse`. Both participants
 * fetch this on chat open so the buyer sees the seller's pending proposal
 * without any real-time channel.
 */
export interface PendingProposalResponse {
  /** What the accepter is agreeing to. Absent from older backends. */
  kind?: TradeKind | null;
  proposalId: string;
  marketplaceChatId: string;
  sellerId: string;
  buyerId: string;
  proposerUserId: string;
  amountUzs: number;
  mode?: TradeMode | null;
  adminId?: string | null;
  adminFeeUzs?: number | null;
  listingId: string | null;
  expiresAt: string;
}

/**
 * Mirrors `uz.efbazaar.trade.card.domain.CardBrand` — the backend enum uses
 * `MC` (not `MASTERCARD`), so JSON on the wire matches these strings exactly.
 * `UNKNOWN` is a defensive fallback for older records; new writes always pick
 * one of the four supported brands.
 */
export type CardBrand = 'HUMO' | 'UZCARD' | 'VISA' | 'MC' | 'UNKNOWN';

export interface CardResponse {
  id: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  brand: CardBrand;
  savedToProfile: boolean;
  createdAt: string;
}

export interface ProposalCreateRequest {
  /** Omitted by older clients; the server then treats it as a sale. */
  kind?: TradeKind;
  marketplaceChatId: string;
  otherPartyUserId: string;
  sellerId: string;
  buyerId: string;
  amountUzs: number;
  mode?: TradeMode;
  cardId?: string;
  adminId?: string;
  adminFeeUzs?: number;
  listingId?: string | null;
}

export interface ProposalAcceptRequest {
  cardId?: string;
}

export type TradeAdminSort = 'DEFAULT' | 'RATING' | 'FEE_ASC';

export interface TradeAdminCardResponse {
  userId: string;
  displayName: string | null;
  photoAvailable: boolean;
  averageStars: number | null;
  ratingCount: number;
  averageWorkSeconds: number | null;
  minFeeUzs: number;
  maxFeeUzs: number;
  online: boolean;
  lastSeenAt: string | null;
  activeTrades: number;
  maxConcurrentTrades: number;
  busy: boolean;
}

export interface TradeAdminProfileResponse {
  userId: string;
  displayName: string | null;
  minFeeUzs: number;
  maxFeeUzs: number;
  bio: string | null;
  acceptingOrders: boolean;
  maxConcurrentTrades: number;
  active: boolean;
  averageStars: number | null;
  ratingCount: number;
  completedCount: number;
  abandonedCount: number;
  cancelledCount: number;
  averageWorkSeconds: number | null;
}

export interface TradeAdminRatingResponse {
  id: string;
  stars: number;
  comment: string | null;
  raterRole: ParticipantRole;
  createdAt: string;
}

export interface TradeAdminProfileUpsertRequest {
  minFeeUzs: number;
  maxFeeUzs: number;
  bio?: string;
  acceptingOrders: boolean;
  maxConcurrentTrades: number;
}

export type TradeStep =
  | 'SELLER_BRIEFED'
  | 'ACCOUNT_TRANSFERRED'
  | 'ACCOUNT_VERIFIED'
  | 'PAYMENT_RECEIVED'
  | 'CREDENTIALS_DELIVERED'
  | 'SELLER_PAID';

export interface TradeStepResponse {
  step: TradeStep;
  labelUz: string;
  completed: boolean;
  completedAt: string | null;
  note: string | null;
}

export type TradeMessageTarget = 'SELLER' | 'BUYER';
export type TradeMessageSenderType = 'USER' | 'SMART_ADMIN' | 'SYSTEM' | 'HUMAN_ADMIN';
export type TradeMessageType = 'TEXT' | 'BUTTON_PROMPT' | 'STATUS' | 'PASSWORD_ONETIME';

export interface TradeMessageResponse {
  id: string;
  tradeId: string;
  senderId: string | null;
  senderType: TradeMessageSenderType;
  messageType: TradeMessageType;
  body?: string | null;
  content?: string | null;
  code?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface AssignAdminRequest {
  adminId: string;
  feeUzs: number;
}

export interface AdminCancelRequest {
  reason?: string;
}

export interface CloseConfirmResponse {
  sellerConfirmed: boolean;
  buyerConfirmed: boolean;
  state: TradeState;
}

export interface RateAdminRequest {
  stars: number;
  comment?: string;
}

export interface RateSellerRequest {
  stars: number;
  comment?: string;
}

export interface SellerRatingResponse {
  id: string;
  tradeId: string;
  sellerId: string;
  raterId: string;
  raterDisplayName: string | null;
  raterUsername: string | null;
  raterPhotoUrl: string | null;
  stars: number;
  comment: string | null;
  hidden: boolean;
  createdAt: string;
}

export interface SellerRatingSummaryResponse {
  sellerId: string;
  averageRating: number;
  ratingCount: number;
  ratingSum: number;
  starCounts: Record<number, number>;
}

export interface BatchSellerRatingSummaryRequest {
  sellerIds: string[];
}

export interface EscalatedTradeResponse {
  id: string;
  sellerId: string;
  buyerId: string;
  priceUzs: number;
  assignedAdminId: string | null;
  adminFeeUzs: number | null;
  escalatedAt: string;
  escalationReason: string | null;
  createdAt: string;
}

/** Localized Uzbek labels for trade states — used by the chat trade panel. */
export const TRADE_STATE_LABEL_UZ: Record<TradeState, string> = {
  INITIATED: 'Boshlangan',
  WAITING_ADMIN: 'Admin javobi kutilmoqda',
  IN_PROGRESS: 'Admin ishlamoqda',
  WAITING_CLOSE_CONFIRM: 'Yakun tasdiqlanmoqda',
  // The buyer's money is frozen the moment they accept the proposal, so
  // this state is no longer waiting for anything they have to do.
  WAITING_PAYMENT: 'Pul platformada saqlanmoqda',
  WAITING_EMAIL_CHANGE: "Email o'zgartirish kutilmoqda",
  VERIFYING_KONAMI_LINK: 'Konami tekshiruvi',
  WAITING_PASSWORD: 'Parol kutilmoqda',
  WAITING_BUYER_VERIFY: 'Xaridor tasdiqlashini kutmoqda',
  SUCCESS: 'Muvaffaqiyatli yakunlandi',
  REJECTED: 'Rad etilgan',
  ORPHANED: 'Muddati tugagan',
};

/** Terminal trade states — polling should stop and no actions are shown. */
export const TERMINAL_TRADE_STATES: ReadonlyArray<TradeState> = [
  'SUCCESS',
  'REJECTED',
  'ORPHANED',
];

export function isTerminalState(state: TradeState): boolean {
  return TERMINAL_TRADE_STATES.includes(state);
}

