/**
 * The platform's share of a smart-admin trade, mirrored from
 * payment-service's TradeCommission.
 *
 *   price < 100 000 so'm   →  10%,  at least  5 000 so'm
 *   price ≥ 100 000 so'm   →  7.5%, at least 10 000 so'm
 *
 * The seller pays it: the buyer is charged the listed price and the seller
 * receives that price minus this fee.
 *
 * This is a copy, and copies drift. It exists because the seller has to see
 * what they will be paid *while typing a price*, before any trade or proposal
 * exists to ask the server about. The authoritative number is always the one
 * payment-service computes at settlement; if they ever disagree, that one is
 * right and this one is the bug.
 *
 * Everything here is whole so'm, not tiyin — a listing price is entered in
 * so'm and this is only ever shown, never sent.
 */

const BAND_SOM = 100_000;

/** @param priceSom the listed price in so'm */
export function tradeFeeSom(priceSom: number): number {
  if (!Number.isFinite(priceSom) || priceSom <= 0) return 0;

  const low = priceSom < BAND_SOM;
  const rate = low ? 0.1 : 0.075;
  const floor = low ? 5_000 : 10_000;

  // Floor, not round: payment-service divides integers, which truncates, and a
  // preview that rounds up would quote the seller a worse number than they get.
  const fee = Math.max(Math.floor(priceSom * rate), floor);

  // Below the floor the fee would exceed the price. payment-service refuses
  // such a trade outright; here it clamps, so the preview shows zero proceeds
  // rather than a negative number.
  return Math.min(fee, priceSom);
}

/** What the seller actually receives. */
export function sellerProceedsSom(priceSom: number): number {
  if (!Number.isFinite(priceSom) || priceSom <= 0) return 0;
  return priceSom - tradeFeeSom(priceSom);
}

/**
 * Below this the fee swallows the price entirely and payment-service will not
 * open the trade, so the form warns instead of quoting zero.
 */
export const MIN_TRADE_PRICE_SOM = 5_000;
