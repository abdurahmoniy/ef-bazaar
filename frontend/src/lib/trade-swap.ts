/**
 * Swaps: what the deal is, and where each side has got to.
 *
 * A swap moves two accounts in opposite directions. Both parties change an
 * email, run forgot-password and submit a password, at their own pace — so the
 * panel has to say not only "what do I do next" but "what is the other person
 * still doing", or a party who has finished their half sees a screen that looks
 * stuck.
 */

import { formatPriceUZS } from './marketplace-format';
import type {
  ParticipantRole,
  TradeKind,
  TradeResponse,
  TradeSideProgress,
  TradeState,
} from './trade-types';

/** What the listing allows, as stored in the `exchange_mode` attribute. */
export type ExchangeMode = 'NONE' | 'EXCHANGE_ONLY' | 'EXCHANGE_WITH_SURCHARGE' | 'BOTH';

export const TRADE_KIND_LABEL_UZ: Record<TradeKind, string> = {
  SALE: 'Sotuv',
  SWAP: 'Obmen',
  SWAP_SURCHARGE: 'Obmen + doplata',
};

export const TRADE_KIND_HINT_UZ: Record<TradeKind, string> = {
  SALE: 'Xaridor pul to‘laydi, sotuvchi akkountni beradi',
  SWAP: 'Ikkala taraf ham akkountini beradi, pul o‘tmaydi',
  SWAP_SURCHARGE: 'Akkountlar almashinadi, ustiga doplata to‘lanadi',
};

/**
 * Toza obmenda summa o'rniga chiqadigan matn.
 *
 * Bunday savdoda pul umuman o'tmaydi va narx 0 bo'lib saqlanadi — ekranda
 * "0 so'm" esa savdo buzuq ochilgandek ko'rinadi.
 */
export const SWAP_AMOUNT_LABEL_UZ = 'Akkount almashish';

/**
 * Savdoda ko'rsatiladigan summa bormi.
 *
 * Doplatali obmenda bor (doplataning o'zi), toza obmenda yo'q. `kind` eski
 * javoblarda bo'lmasligi mumkin: sotuvda narx hech qachon 0 bo'lmaydi —
 * server 0 ni rad etadi — shuning uchun 0 narx obmen belgisi.
 */
export function hasTradeAmount(
  kind: TradeKind | null | undefined,
  priceUzs: number | null | undefined,
): boolean {
  return kind !== 'SWAP' && typeof priceUzs === 'number' && priceUzs > 0;
}

/** Summa, yoki toza obmen bo'lsa uning o'rniga savdo turi. */
export function tradeAmountLabel(
  kind: TradeKind | null | undefined,
  priceUzs: number | null | undefined,
): string {
  return hasTradeAmount(kind, priceUzs) ? formatPriceUZS(priceUzs as number) : SWAP_AMOUNT_LABEL_UZ;
}

/**
 * Which formats a listing may be traded under.
 *
 * Returned in the order they are offered, so the picker is stable. An
 * exchange-only listing cannot be bought outright — that is the seller's own
 * published term, and the server refuses it too.
 */
export function allowedKinds(mode: ExchangeMode | null | undefined): TradeKind[] {
  switch (mode) {
    case 'EXCHANGE_ONLY':
      return ['SWAP'];
    case 'EXCHANGE_WITH_SURCHARGE':
      return ['SALE', 'SWAP_SURCHARGE'];
    case 'BOTH':
      return ['SALE', 'SWAP', 'SWAP_SURCHARGE'];
    default:
      return ['SALE'];
  }
}

/** Whether the format asks the accepter for money at all. */
export function needsAmount(kind: TradeKind): boolean {
  return kind !== 'SWAP';
}

export function isSwap(kind: TradeKind | null | undefined): boolean {
  return kind === 'SWAP' || kind === 'SWAP_SURCHARGE';
}

export type SwapStep =
  | 'email'
  | 'konami'
  | 'password'
  | 'decision'
  | 'done';

/** The furthest step this party has completed. */
export function stepOf(side: TradeSideProgress): SwapStep {
  if (side.confirmed || side.rejected) return 'done';
  if (side.passwordSent) return 'decision';
  if (side.konamiVerified) return 'password';
  if (side.emailChanged) return 'konami';
  return 'email';
}

export const SWAP_STEP_LABEL_UZ: Record<SwapStep, string> = {
  email: 'Email o‘zgartirilmoqda',
  konami: 'Konami tekshiruvi kutilmoqda',
  password: 'Parol kutilmoqda',
  decision: 'Tasdiqlash kutilmoqda',
  done: 'Yakunlandi',
};

export function sideOf(
  trade: TradeResponse,
  role: ParticipantRole,
): TradeSideProgress | null {
  return trade.sides?.find((s) => s.role === role) ?? null;
}

/**
 * The other party's progress, phrased for the reader.
 *
 * Null when there is nothing useful to say — a sale, or a response from a
 * backend that predates sides.
 */
export function counterpartStatus(
  trade: TradeResponse,
  viewerRole: ParticipantRole | null,
): string | null {
  if (!isSwap(trade.kind) || !viewerRole) return null;
  const other = sideOf(trade, viewerRole === 'SELLER' ? 'BUYER' : 'SELLER');
  if (!other) return null;
  if (other.rejected) return 'Ikkinchi taraf savdoni rad etdi';
  return `Ikkinchi taraf: ${SWAP_STEP_LABEL_UZ[stepOf(other)]}`;
}

/** Whether this party has already done the current step and is now waiting. */
export function isWaitingForCounterpart(
  trade: TradeResponse,
  viewerRole: ParticipantRole | null,
): boolean {
  if (!isSwap(trade.kind) || !viewerRole) return false;
  const mine = sideOf(trade, viewerRole);
  const other = sideOf(trade, viewerRole === 'SELLER' ? 'BUYER' : 'SELLER');
  if (!mine || !other) return false;
  // Steps are ordered, so "further along" is enough — no need to know which
  // state the trade itself is in.
  const order: SwapStep[] = ['email', 'konami', 'password', 'decision', 'done'];
  return order.indexOf(stepOf(mine)) > order.indexOf(stepOf(other));
}

/** What each state asks a party to do, so we can tell if they have done it. */
const CLEARED_BY_STATE: Partial<
  Record<TradeState, (side: TradeSideProgress) => boolean>
> = {
  WAITING_EMAIL_CHANGE: (s) => s.emailChanged,
  VERIFYING_KONAMI_LINK: (s) => s.konamiVerified,
  WAITING_PASSWORD: (s) => s.passwordSent,
  WAITING_BUYER_VERIFY: (s) => s.confirmed || s.rejected,
};

/**
 * Whether this party has already done what the current state asks of them.
 *
 * A swap only advances once both parties have, so the one who finished first
 * stays on the same state — and, without this, on the same screen: the same
 * verification code, the same button they just pressed, no sign their click
 * registered. Asked per state rather than by comparing progress with the other
 * party, because the question here is "is there anything left for me to do",
 * which is true even when the other party is somehow further ahead.
 */
export function hasClearedCurrentStep(
  trade: TradeResponse,
  viewerRole: ParticipantRole | null,
): boolean {
  if (!isSwap(trade.kind) || !viewerRole) return false;
  const cleared = CLEARED_BY_STATE[trade.state];
  if (!cleared) return false;
  const mine = sideOf(trade, viewerRole);
  return mine ? cleared(mine) : false;
}
