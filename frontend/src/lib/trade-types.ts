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
  chatId: string | null;
  createdAt: string;
  expiresAt: string | null;
  stateDeadline: string | null;
  role: ParticipantRole | null;
}

export interface ProposalResponse {
  proposalId: string;
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
  WAITING_EMAIL_CHANGE: "Email o'zgarishi kutilmoqda",
  VERIFYING_KONAMI_LINK: 'Konami havolasi tekshirilmoqda',
  WAITING_PASSWORD: 'Parol kutilmoqda',
  WAITING_BUYER_VERIFY: 'Xaridor tasdiqi kutilmoqda',
  SUCCESS: 'Yakunlandi',
  REJECTED: 'Rad etildi',
  ORPHANED: 'Bekor qilindi',
};
