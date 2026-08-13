import { detectBrand, luhnCheck, normalizePan, type DetectableBrand } from './card-detect';

/**
 * The add-card form's whole decision layer: what the admin has typed, what it
 * means, and whether it may be sent. Pure — the component only holds strings.
 *
 * Two rules this module exists to keep:
 *
 *  1. **A full PAN never leaves through a message.** `panMessage` is built from
 *     the brand and nothing else. The digits go into `request.pan` and travel
 *     straight to the API; they belong in no log, no error and no analytics.
 *  2. **Nothing the backend would reject gets sent.** `PlatformCardService`
 *     answers 400 on a bad Luhn, and `CardBrand.detect` *throws* (a 500) on a
 *     BIN no brand claims — so an undetectable brand is blocked here, not
 *     discovered by the admin as a server error.
 */

/** What the four inputs currently hold, verbatim. */
export interface PlatformCardDraft {
  pan: string;
  holderName: string;
  expiryMonth: string;
  expiryYear: string;
}

/** Body of `POST /api/v1/admin/payments/cards` (`PlatformCardCreateRequest`). */
export interface PlatformCardCreateRequest {
  pan: string;
  holderName: string;
  expiryMonth: number;
  expiryYear: number;
}

export interface PlatformCardDraftReview {
  brand: DetectableBrand | null;
  /** Hint under the number input. Brand-derived — never contains digits. */
  panMessage: string;
  panValid: boolean;
  /** Null while the fields are empty: an untouched form should not scold. */
  expiryMessage: string | null;
  expiryValid: boolean;
  holderValid: boolean;
  canSubmit: boolean;
  /** Non-null exactly when `canSubmit` — nothing else may be posted. */
  request: PlatformCardCreateRequest | null;
}

/** Backend `@Size(max = 64)`, stored upper-cased. Mirror both as we type. */
const HOLDER_MAX = 64;

/** Backend `@Min(2000) @Max(2100)` on `expiryYear`. */
const YEAR_MIN = 2000;
const YEAR_MAX = 2100;

export function formatHolderInput(raw: string): string {
  return (raw ?? '').toUpperCase().slice(0, HOLDER_MAX);
}

function reviewPan(pan: string): Pick<PlatformCardDraftReview, 'brand' | 'panMessage' | 'panValid'> {
  const digits = normalizePan(pan);
  if (digits.length === 0) {
    return { brand: null, panMessage: 'Humo yoki Uzcard raqamini kiriting', panValid: false };
  }

  const brand = detectBrand(digits);
  if (!brand) {
    return { brand: null, panMessage: "Karta turini aniqlab bo'lmadi", panValid: false };
  }
  // luhnCheck already enforces the 12..19 length the backend requires; the
  // explicit length test only separates "still typing" from "wrong".
  if (digits.length < 12) {
    return { brand, panMessage: `${brand} — raqamni to'liq kiriting`, panValid: false };
  }
  if (!luhnCheck(digits)) {
    return { brand, panMessage: `${brand} — raqam noto'g'ri`, panValid: false };
  }
  return { brand, panMessage: brand, panValid: true };
}

interface ExpiryReview {
  expiryMessage: string | null;
  expiryValid: boolean;
  month: number;
  year: number;
}

function reviewExpiry(rawMonth: string, rawYear: string, now: Date): ExpiryReview {
  const monthDigits = (rawMonth ?? '').replace(/\D+/g, '');
  const yearDigits = (rawYear ?? '').replace(/\D+/g, '');
  const blank = { expiryValid: false, month: 0, year: 0 };

  if (monthDigits.length === 0 || yearDigits.length === 0) {
    return { ...blank, expiryMessage: null };
  }

  const month = Number(monthDigits);
  if (month < 1 || month > 12) {
    return { ...blank, expiryMessage: "Oy 1 dan 12 gacha bo'lishi kerak" };
  }

  // A card face prints `12/29`; an admin copying it types two digits.
  const year =
    yearDigits.length === 2 ? 2000 + Number(yearDigits)
      : yearDigits.length === 4 ? Number(yearDigits)
        : Number.NaN;
  if (!Number.isFinite(year) || year < YEAR_MIN || year > YEAR_MAX) {
    return { ...blank, expiryMessage: 'Yilni kiriting — masalan 29 yoki 2029' };
  }

  // A card is good through the last day of its expiry month, so compare on the
  // month, not the day.
  const nowMonths = now.getFullYear() * 12 + now.getMonth();
  if (year * 12 + (month - 1) < nowMonths) {
    return { ...blank, expiryMessage: "Karta muddati o'tgan" };
  }

  return { expiryMessage: null, expiryValid: true, month, year };
}

export function reviewPlatformCardDraft(
  draft: PlatformCardDraft,
  now: Date = new Date(),
): PlatformCardDraftReview {
  const pan = reviewPan(draft.pan);
  const holderName = formatHolderInput(draft.holderName).trim();
  const holderValid = holderName.length > 0;
  const expiry = reviewExpiry(draft.expiryMonth, draft.expiryYear, now);

  const canSubmit = pan.panValid && holderValid && expiry.expiryValid;

  return {
    ...pan,
    holderValid,
    expiryMessage: expiry.expiryMessage,
    expiryValid: expiry.expiryValid,
    canSubmit,
    request: canSubmit
      ? {
        pan: normalizePan(draft.pan),
        holderName,
        expiryMonth: expiry.month,
        expiryYear: expiry.year,
      }
      : null,
  };
}
