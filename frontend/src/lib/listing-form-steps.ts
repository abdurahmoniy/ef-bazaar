/**
 * E'lon/akkount sehrgarining qadamlari.
 *
 * <p>Alohida modul: qaysi rejimda qaysi qadam borligi test bilan
 * qulflanadi va narx qadami akkount oqimiga bilinmay qaytib kelmaydi.
 * Formaning o'zi og'ir — u server-only zanjirni tortadi va uni test
 * ichida import qilib bo'lmaydi.
 */

export const LISTING_STEPS = ['photos', 'basics', 'gameplay', 'pricing', 'review'] as const;

/** Akkountda narx qadami yo'q — narx e'lonning sozlamasi. */
export const ACCOUNT_STEPS = ['photos', 'basics', 'gameplay', 'review'] as const;

export type StepId = (typeof LISTING_STEPS)[number];
export type ListingFormMode = 'listing' | 'account';

export function stepsFor(mode: ListingFormMode): readonly StepId[] {
  return mode === 'account' ? ACCOUNT_STEPS : LISTING_STEPS;
}
