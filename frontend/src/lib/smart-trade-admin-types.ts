import type { ParticipantRole, TradeKind, TradeState } from './trade-types';

/**
 * Shapes returned by trade-service's `/api/v1/admin/smart-trades/**`.
 */

/** The worker-driven steps an admin may complete by hand. */
export type SmartTradeAction = 'EMAIL_CHANGE_CODE' | 'KONAMI_EMAIL_CONFIRM' | 'NONE';

export interface SmartTradeRow {
  id: string;
  kind: TradeKind;
  state: TradeState;
  sellerId: string;
  buyerId: string;
  /** `@telegram` handle, else display name; null when auth no longer knows the user. */
  sellerName: string | null;
  buyerName: string | null;
  /** When the trade last moved — how long it has been sitting in this state. */
  stateSince: string;
  stateDeadline: string | null;
  expectedAction: SmartTradeAction;
  createdAt: string;
}

export interface SmartTradeSide {
  role: ParticipantRole;
  /** Null when this party moves no account — a sale's buyer. */
  mailboxId: string | null;
  mailboxEmail: string | null;
  /** False while Mailcow has not confirmed the box; its inbox cannot be opened yet. */
  mailboxProvisioned: boolean;
  emailChangeCode: string | null;
  emailChangeCodeAt: string | null;
  emailChangedAt: string | null;
  konamiVerifiedAt: string | null;
}

export interface SmartTradeDetail {
  trade: SmartTradeRow;
  /** Always SELLER then BUYER. */
  sides: SmartTradeSide[];
}
