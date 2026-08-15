/**
 * Taking money out of the wallet.
 *
 * A ticket freezes the amount straight away and waits for an admin to send the
 * money by hand. The frozen part shows up as `withdrawPendingTiyin`, so a user
 * who opens a ticket can see the money is spoken for without it having left.
 */

export type WithdrawalStatus = 'OPEN' | 'PAID' | 'REJECTED';

export interface WithdrawalTicket {
  id: string;
  userId: string;
  amountTiyin: number;
  last4: string;
  holderName: string;
  phone: string;
  telegramUsername: string | null;
  status: WithdrawalStatus;
  createdAt: string;
  closedAt: string | null;
  closeNote: string | null;
}

export interface WithdrawalDraft {
  amountTiyin: number;
  pan: string;
  holderName: string;
  phone: string;
  telegramUsername?: string;
}

/** Matches WithdrawalService.MIN_WITHDRAWAL_TIYIN. */
export const MIN_WITHDRAWAL_TIYIN = 1_000_000;

export type DraftProblem =
  | 'amount-too-small'
  | 'amount-over-balance'
  | 'pan-not-16'
  | 'holder-missing'
  | 'phone-missing';

/**
 * Checks a draft before it costs a round trip.
 *
 * Duplicates the server's rules on purpose and is allowed to drift: the server
 * refuses independently, so the worst a stale copy here can do is let a request
 * through to be rejected properly.
 */
export function validateDraft(
  draft: WithdrawalDraft,
  availableTiyin: number,
): DraftProblem | null {
  if (draft.amountTiyin < MIN_WITHDRAWAL_TIYIN) return 'amount-too-small';
  if (draft.amountTiyin > availableTiyin) return 'amount-over-balance';
  if (draft.pan.replace(/\D/g, '').length !== 16) return 'pan-not-16';
  if (draft.holderName.trim().length < 3) return 'holder-missing';
  if (draft.phone.replace(/\D/g, '').length < 7) return 'phone-missing';
  return null;
}

export const DRAFT_PROBLEM_UZ: Record<DraftProblem, string> = {
  'amount-too-small': `Eng kam yechish summasi ${MIN_WITHDRAWAL_TIYIN / 100} so‘m`,
  'amount-over-balance': 'Hamyonda buncha mablag‘ yo‘q',
  'pan-not-16': 'Karta raqami 16 xonali bo‘lishi kerak',
  'holder-missing': 'Karta egasining ismini kiriting',
  'phone-missing': 'Telefon raqamini kiriting',
};

/** Card holder names are stored uppercase — the database checks it too. */
export function normalizeHolderName(input: string): string {
  return input.replace(/[^A-Za-z' ]/g, '').replace(/\s+/g, ' ').trimStart().toUpperCase();
}

/** `8600 1234 5678 9010` — grouped for reading, stripped before sending. */
export function formatPan(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

const json = { Accept: 'application/json' };
const PREFIX = '/api/payment/v1/payments/withdrawals';
const ADMIN_PREFIX = '/api/payment/v1/admin/withdrawals';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string; error?: string };
    if (typeof body.message === 'string') return body.message;
    if (typeof body.error === 'string') return body.error;
  } catch {
    // fall through
  }
  return 'So‘rov bajarilmadi';
}

export async function createWithdrawal(
  draft: WithdrawalDraft,
): Promise<Result<WithdrawalTicket>> {
  const response = await fetch(PREFIX, {
    method: 'POST',
    credentials: 'include',
    headers: { ...json, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...draft, pan: draft.pan.replace(/\D/g, '') }),
  });
  if (!response.ok) return { ok: false, error: await readError(response) };
  return { ok: true, data: (await response.json()) as WithdrawalTicket };
}

export async function fetchMyWithdrawals(): Promise<WithdrawalTicket[]> {
  const response = await fetch(PREFIX, { credentials: 'include', headers: json });
  if (!response.ok) return [];
  return (await response.json()) as WithdrawalTicket[];
}

// ----- admin -----

export async function fetchWithdrawalQueue(): Promise<WithdrawalTicket[]> {
  const response = await fetch(ADMIN_PREFIX, { credentials: 'include', headers: json });
  if (!response.ok) return [];
  return (await response.json()) as WithdrawalTicket[];
}

/** Separate call by design — the full number never rides along in a list. */
export async function revealWithdrawalPan(id: string): Promise<Result<string>> {
  const response = await fetch(`${ADMIN_PREFIX}/${encodeURIComponent(id)}/pan`, {
    credentials: 'include',
    headers: json,
  });
  if (!response.ok) return { ok: false, error: await readError(response) };
  const body = (await response.json()) as { pan: string };
  return { ok: true, data: body.pan };
}

export async function closeWithdrawal(
  id: string,
  outcome: 'paid' | 'reject',
  note: string,
): Promise<Result<WithdrawalTicket>> {
  const response = await fetch(`${ADMIN_PREFIX}/${encodeURIComponent(id)}/${outcome}`, {
    method: 'POST',
    credentials: 'include',
    headers: { ...json, 'Content-Type': 'application/json' },
    body: JSON.stringify({ note: note.trim() || null }),
  });
  if (!response.ok) return { ok: false, error: await readError(response) };
  return { ok: true, data: (await response.json()) as WithdrawalTicket };
}
