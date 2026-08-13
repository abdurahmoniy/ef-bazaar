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
