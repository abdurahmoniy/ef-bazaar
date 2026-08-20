/**
 * What a buyer is short by, and where to send them.
 *
 * Accepting a proposal freezes the price from the wallet. When the balance
 * cannot cover it the accept fails, and telling someone to "top up" without
 * saying how much leaves them to work it out from two numbers on two different
 * pages. This computes the difference and builds the link that arrives at the
 * top-up box with it already filled in.
 */

/** trade-service counts so'm; payment-service counts tiyin. */
const TIYIN_PER_SOM = 100;

export function shortfallSom(priceSom: number, availableTiyin: number): number {
  const missingTiyin = priceSom * TIYIN_PER_SOM - availableTiyin;
  if (missingTiyin <= 0) return 0;
  // Round up: topping up the exact tiyin still leaves the accept a tiyin short
  // if the balance carries a remainder, and so'm is the unit the user pays in.
  return Math.ceil(missingTiyin / TIYIN_PER_SOM);
}

/**
 * Where to land once the shortfall invoice exists.
 *
 * Carries the amount so the wallet page can still pre-fill the box if the
 * invoice could not be created — a live invoice already renders its own panel,
 * so the parameter is a fallback rather than the mechanism.
 */
/**
 * What the proposer must have in their wallet before sending a swap.
 *
 * The platform's fee comes out of their side, and only the part the
 * accepter's surcharge does not cover is taken from their balance. Checked
 * when the proposal is sent rather than when it is accepted, because at
 * accept time it is the other party who gets turned away — by a balance they
 * cannot see and cannot fix.
 */
export function proposerShortfallSom(
  feeSom: number,
  surchargeSom: number,
  availableTiyin: number,
): number {
  const owes = Math.max(0, feeSom - surchargeSom);
  if (owes === 0) return 0;
  return shortfallSom(owes, availableTiyin);
}

export function topUpHref(shortfall: number, returnTo?: string): string {
  const params = new URLSearchParams({ toldirish: String(shortfall) });
  // Where to send them once the invoice is paid. Without it a proposer who
  // went to top up has to find their way back to the chat and start the
  // proposal again from memory.
  if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
    params.set('keyin', returnTo);
  }
  return `/hamyon?${params.toString()}`;
}

/**
 * Whether a failed accept failed for lack of money.
 *
 * Matched on the message because that is what survives the two hops from
 * payment-service through trade-service to here — the 409 it arrives as is
 * also what a second open ticket or a taken invoice slot returns.
 */
export function isInsufficientFunds(error: string): boolean {
  // `.?` rather than a list of quote characters: the message reaches here as
  // typed in Java (ASCII ') or as re-typed with a typographic one, and the
  // difference is invisible in a diff.
  return /mablag.?\s*yetarli emas/i.test(error);
}
