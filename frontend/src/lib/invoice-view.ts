import type { InvoiceResponse } from './payment-types';

/** Whole seconds left before `expiresAt`. Clamped at 0; never NaN. */
export function secondsUntil(expiresAt: string, now: number): number {
  const deadline = new Date(expiresAt).getTime();
  if (Number.isNaN(deadline)) return 0;
  return Math.max(0, Math.floor((deadline - now) / 1000));
}

/** `900` -> `15:00`. */
export function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * What a screen reader should say about the clock, or `null` for silence.
 *
 * The ticking digits themselves cannot go in a live region — they change every
 * second, so the reader would talk over the user for the whole fifteen minutes.
 * This returns the same string until a threshold is crossed, which is exactly
 * when a live region speaks: at five minutes, at one minute, and at zero.
 */
export function countdownAnnouncement(secondsLeft: number): string | null {
  const left = Math.max(0, Math.floor(secondsLeft));
  if (left === 0) return 'To‘lov muddati tugadi. Yangi so‘rov yarating.';
  if (left <= 60) return 'To‘lov muddatiga bir daqiqadan kam vaqt qoldi.';
  if (left <= 300) return 'To‘lov muddatiga besh daqiqa qoldi.';
  return null;
}

/**
 * How much more than the requested amount the user must send. Non-zero when
 * the disambiguation bump fired — another invoice was already waiting for the
 * same amount, so this one was nudged to keep the two tellable apart.
 */
export function invoiceBumpTiyin(
  invoice: Pick<InvoiceResponse, 'requestedTiyin' | 'transferTiyin'>,
): number {
  return invoice.transferTiyin - invoice.requestedTiyin;
}

/**
 * What goes on the clipboard: plain digits a banking app will accept.
 *
 * The bump moves in whole so'm, so the remainder is normally zero — but it is
 * appended rather than truncated when it is not. A transfer that is off by a
 * single tiyin cannot be attributed and lands in the manual queue.
 */
export function transferAmountForCopy(transferTiyin: number): string {
  const whole = Math.trunc(transferTiyin / 100);
  const frac = Math.abs(transferTiyin % 100);
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0')}`;
}
