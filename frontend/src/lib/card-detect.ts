/**
 * Client-side card helpers used by the profile "Kartalar" tab and the
 * card-add modal:
 *   - `detectBrand(pan)` picks a `CardBrand` from the BIN so we can render a
 *     brand badge as the user types and pass `brand` in the create request.
 *   - `luhnCheck(pan)` mirrors the backend `LuhnValidator` so the UI can
 *     reject obviously wrong PANs before hitting the network.
 *
 * BIN rules match the four brands the backend enum supports
 * (`VISA, MC, UZCARD, HUMO` — see
 * `backend/trade-service/.../card/domain/CardBrand.java`).
 */
export type DetectableBrand = 'VISA' | 'MC' | 'UZCARD' | 'HUMO';

/** Strip everything but digits — the modal keeps the input pretty (with
 * spaces), so callers hand us the raw display value. */
export function normalizePan(pan: string): string {
  return (pan ?? '').replace(/\D+/g, '');
}

/**
 * BIN-based brand detection. Rules:
 *   - `4…`        → VISA
 *   - `51-55…` or `2221-2720…` → MC (Mastercard, as the backend enum spells it)
 *   - `8600…`    → UZCARD
 *   - `9860…`    → HUMO
 *   - anything else → `null` (rejected by the form)
 */
export function detectBrand(pan: string): DetectableBrand | null {
  const digits = normalizePan(pan);
  if (digits.length === 0) return null;

  if (digits.startsWith('4')) return 'VISA';

  if (digits.length >= 2) {
    const twoDigit = Number(digits.slice(0, 2));
    if (twoDigit >= 51 && twoDigit <= 55) return 'MC';
  }
  if (digits.length >= 4) {
    const fourDigit = Number(digits.slice(0, 4));
    if (fourDigit >= 2221 && fourDigit <= 2720) return 'MC';
    if (digits.startsWith('8600')) return 'UZCARD';
    if (digits.startsWith('9860')) return 'HUMO';
  }

  return null;
}

/**
 * Standard Luhn (mod-10) checksum. Matches the backend
 * `LuhnValidator.isValid`: rejects non-digit characters, requires a length
 * between 12 and 19 digits after stripping spaces.
 */
export function luhnCheck(pan: string): boolean {
  const digits = normalizePan(pan);
  if (digits.length < 12 || digits.length > 19) return false;

  let sum = 0;
  let doubleIt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    const d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    let value = d;
    if (doubleIt) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    doubleIt = !doubleIt;
  }
  return sum % 10 === 0;
}

/**
 * Format a raw PAN for display — `1234567890123456` → `1234 5678 9012 3456`.
 * Groups by 4 up to 19 digits. Non-digit input is stripped first.
 */
export function formatPanForDisplay(pan: string): string {
  const digits = normalizePan(pan).slice(0, 19);
  const groups: string[] = [];
  for (let i = 0; i < digits.length; i += 4) {
    groups.push(digits.slice(i, i + 4));
  }
  return groups.join(' ');
}
