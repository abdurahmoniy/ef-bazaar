/**
 * Types mirroring trade-service DTOs (Java records). Shapes match:
 *   - uz.efbazaar.trade.trade.dto.TradeResponse
 *   - uz.efbazaar.trade.trade.dto.ProposalResponse
 *   - uz.efbazaar.trade.card.dto.CardResponse
 */

export type TradeState =
  | 'INITIATED'
  | 'WAITING_PAYMENT'
  | 'WAITING_EMAIL_CHANGE'
  | 'VERIFYING_KONAMI_LINK'
  | 'WAITING_PASSWORD'
  | 'WAITING_BUYER_VERIFY'
  | 'SUCCESS'
  | 'REJECTED'
  | 'ORPHANED';

export type ParticipantRole = 'SELLER' | 'BUYER';

export interface TradeResponse {
  id: string;
  state: TradeState;
  sellerId: string;
  buyerId: string;
  priceUzs: number;
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
  proposalId: string;
  marketplaceChatId: string;
  sellerId: string;
  buyerId: string;
  proposerUserId: string;
  amountUzs: number;
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
  marketplaceChatId: string;
  otherPartyUserId: string;
  sellerId: string;
  buyerId: string;
  amountUzs: number;
  cardId: string;
  listingId?: string | null;
}

export interface ProposalAcceptRequest {
  cardId: string;
}

/** Localized Uzbek labels for trade states — used by the chat trade panel. */
export const TRADE_STATE_LABEL_UZ: Record<TradeState, string> = {
  INITIATED: 'Boshlangan',
  WAITING_PAYMENT: "To'lov kutilmoqda",
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
