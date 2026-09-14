import type { ParticipantRole, TradeState } from './trade-types';
import type { SmartTradeAction, SmartTradeDetail, SmartTradeSide } from './smart-trade-admin-types';

export const ROLE_LABEL_UZ: Record<ParticipantRole, string> = {
  SELLER: 'Sotuvchi',
  BUYER: 'Oluvchi',
};

export const ACTION_LABEL_UZ: Record<SmartTradeAction, string> = {
  EMAIL_CHANGE_CODE: 'Email almashtirish kodi kutilmoqda',
  KONAMI_EMAIL_CONFIRM: 'Konami tasdiqlash xati kutilmoqda',
  NONE: '',
};

/**
 * The SMART happy path, in order. Used to draw the step chain; a state not in
 * it (a terminal failure) simply lights no step.
 */
export const SMART_STEPS: ReadonlyArray<TradeState> = [
  'INITIATED',
  'WAITING_PAYMENT',
  'WAITING_EMAIL_CHANGE',
  'VERIFYING_KONAMI_LINK',
  'WAITING_PASSWORD',
  'WAITING_BUYER_VERIFY',
  'SUCCESS',
];

/** Index of the current step, or -1 when the state is off the happy path. */
export function stepIndex(state: TradeState): number {
  return SMART_STEPS.indexOf(state);
}

/** The sides that actually have an escrow mailbox — what the mailbox switch offers. */
export function sidesWithMailbox(detail: SmartTradeDetail): SmartTradeSide[] {
  return detail.sides.filter((side) => side.mailboxId !== null);
}

/**
 * Which party's mailbox the right-hand pane shows.
 *
 * The one asked for when it has a mailbox; otherwise the first that does. A
 * stale `?mb=BUYER` on a sale — where the buyer has no box — falls back to the
 * seller instead of rendering an empty pane.
 */
export function pickMailboxSide(
  detail: SmartTradeDetail,
  requested: string | undefined,
): SmartTradeSide | null {
  const withBox = sidesWithMailbox(detail);
  return withBox.find((side) => side.role === requested) ?? withBox[0] ?? null;
}

/** Whether this party has already cleared the step the trade is waiting on. */
export function sideDone(side: SmartTradeSide, action: SmartTradeAction): boolean {
  if (action === 'EMAIL_CHANGE_CODE') return side.emailChangeCode !== null;
  if (action === 'KONAMI_EMAIL_CONFIRM') return side.konamiVerifiedAt !== null;
  return false;
}

/** A human duration for "how long has it been stuck": `12 daq`, `3 soat`, `2 kun`. */
export function sinceLabel(iso: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} daq`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} soat`;
  return `${Math.floor(hours / 24)} kun`;
}

/** Only a six-digit code is accepted — the shape Konami sends. */
export function isValidCode(value: string): boolean {
  return /^\d{6}$/.test(value.trim());
}
