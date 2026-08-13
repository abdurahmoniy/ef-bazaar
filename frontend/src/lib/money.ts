/**
 * Money is BIGINT tiyin end to end. 1 so'm = 100 tiyin.
 *
 * Never do arithmetic on formatted strings, and never send a float to the
 * backend — `uzsToTiyin` is the only conversion the UI performs.
 */

/** U+00A0 NO-BREAK SPACE — a thousands separator must not line-break. */
const NBSP = '\u00A0';

/** 10_000_000 -> "100 000"; 10_000_055 -> "100 000,55" */
export function formatTiyin(tiyin: number): string {
  const whole = Math.trunc(tiyin / 100);
  const frac = Math.abs(tiyin % 100);
  // `toLocaleString('ru-RU')` groups with U+00A0 on Node's ICU build and with
  // U+202F (narrow no-break space) in some browsers. JS `\s` matches both, so
  // this normalization is what makes the output identical everywhere — and it
  // is why the tests can assert one exact codepoint. Do not simplify it away.
  const grouped = whole.toLocaleString('ru-RU').replace(/\s/g, NBSP);
  return frac === 0 ? grouped : `${grouped},${String(frac).padStart(2, '0')}`;
}

export function uzsToTiyin(uzs: number): number {
  return Math.round(uzs) * 100;
}
