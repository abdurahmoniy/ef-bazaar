import { formatTiyin, uzsToTiyin } from './money';

/**
 * The "Boshqa summa" field. The user types so'm; everything downstream is
 * tiyin, so this module owns the one place a typed string becomes a number.
 *
 * The backend is the authority on the floor (`payment.deposit.minimum-uzs`)
 * and returns its own Uzbek message. Mirroring it here only saves an obvious
 * round trip — it never replaces the server-side check.
 */
export const MIN_TOP_UP_UZS = 1000;

export const TOP_UP_PRESETS = [50_000, 100_000, 200_000, 500_000] as const;

/** U+00A0 — a grouped amount must not break across lines mid-number. */
const NBSP = '\u00A0';

function digitsOf(raw: string): string {
  return (raw ?? '').replace(/\D+/g, '').replace(/^0+(?=\d)/, '');
}

/** Digits only, grouped as the user types: `100000` -> `100 000`. */
export function formatTopUpInput(raw: string): string {
  const digits = digitsOf(raw);
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

export interface TopUpAmount {
  /** Whole so'm, or null when the value cannot be used. */
  uzs: number | null;
  error: string | null;
}

export function parseTopUpAmount(raw: string): TopUpAmount {
  const digits = digitsOf(raw);
  if (!digits || Number(digits) === 0) {
    return { uzs: null, error: 'Summani kiriting.' };
  }

  const uzs = Number(digits);
  // Anything past this cannot survive the ×100 into tiyin, and a silently
  // rounded amount would never match the transfer.
  if (!Number.isSafeInteger(uzs) || !Number.isSafeInteger(uzsToTiyin(uzs))) {
    return { uzs: null, error: 'Summa juda katta.' };
  }
  if (uzs < MIN_TOP_UP_UZS) {
    return {
      uzs: null,
      error: `Eng kam summa: ${formatTiyin(uzsToTiyin(MIN_TOP_UP_UZS))} so'm.`,
    };
  }
  return { uzs, error: null };
}
