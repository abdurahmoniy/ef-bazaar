import type { CardMovement } from './payment-types';

/**
 * How a credit's reconciliation status reads to an admin.
 *
 * A status the backend grows later falls through to its raw value rather than
 * to a blank cell — same rule as `UNKNOWN_KIND_LABEL` in `wallet-history.ts`.
 */
const CREDIT_STATUS_LABELS: Record<string, string> = {
  MATCHED: "So'rovga biriktirildi",
  UNMATCHED: 'Tekshirilmagan',
  MANUALLY_RESOLVED: "Qo'lda biriktirilgan",
  IGNORED: "E'tiborsiz qoldirilgan",
};

export function creditStatusLabel(status: string): string {
  return CREDIT_STATUS_LABELS[status] ?? status;
}

/**
 * The one line under a movement that says what it was.
 *
 * A debit carries the bank's own words for where the money went; a credit
 * carries whether anybody has accounted for it. Neither is guaranteed, and an
 * empty line is worse than none — the caller drops a null.
 */
export function movementDetail(movement: CardMovement): string | null {
  if (movement.direction === 'OUT') {
    return movement.description?.trim() || null;
  }
  return movement.creditStatus ? creditStatusLabel(movement.creditStatus) : null;
}

/**
 * The cards that actually appear in a page of history, in the order they are
 * first seen.
 *
 * Built from the movements rather than from the card list on purpose: a card
 * that has been deleted, or one the platform never owned, still shows up in the
 * history and must still be filterable. Offering only today's cards would hide
 * exactly the rows an admin is looking for when something is wrong.
 */
export function cardsInHistory(movements: CardMovement[]): string[] {
  const seen: string[] = [];
  for (const m of movements) {
    if (!seen.includes(m.cardLast4)) seen.push(m.cardLast4);
  }
  return seen;
}

export interface MovementTotals {
  inTiyin: number;
  outTiyin: number;
  netTiyin: number;
}

/**
 * What the page on screen adds up to.
 *
 * Deliberately of the ROWS SHOWN, not of all time: it answers "what moved in
 * what I am looking at", which is the question an admin filtering to one card
 * and one page is actually asking. The all-time figures are the dashboard's.
 */
export function movementTotals(movements: CardMovement[]): MovementTotals {
  let inTiyin = 0;
  let outTiyin = 0;
  for (const m of movements) {
    if (m.direction === 'IN') inTiyin += m.amountTiyin;
    else outTiyin += m.amountTiyin;
  }
  return { inTiyin, outTiyin, netTiyin: inTiyin - outTiyin };
}

/**
 * A short flag on a row that needs a second look, or null for the ordinary
 * ones.
 *
 * Only the rows that are actually unusual get one. A badge on every row is a
 * badge on none — the list is scanned, not read.
 */
export function movementBadge(movement: CardMovement): string | null {
  // A debit on a card we do not own is the strangest thing on this screen:
  // the userbot is watching a chat that carries somebody else's card.
  if (movement.direction === 'OUT' && movement.ownCard === false) {
    return "Bizning karta emas";
  }
  if (movement.creditStatus === 'UNMATCHED') return 'Tekshirilmagan';
  if (movement.creditStatus === 'IGNORED') return "E'tiborsiz qoldirilgan";
  return null;
}

/** Tashkent is UTC+5 with no daylight saving, so a fixed offset is exact. */
const UZ_OFFSET_MS = 5 * 60 * 60 * 1000;

const UZ_MONTHS = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
];

/** `2026-09-11` in Tashkent time — the key a day groups by. */
function uzDayKey(iso: string): string {
  return new Date(new Date(iso).getTime() + UZ_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * How a day heading reads.
 *
 * "Bugun" and "Kecha" are relative to `now`, which is passed in rather than
 * read from the clock: a component rendered on the server and hydrated on the
 * client would otherwise disagree about what today is across midnight, and
 * React would blow up on the mismatch.
 */
export function dayLabel(dayKey: string, now: Date): string {
  const today = uzDayKey(now.toISOString());
  if (dayKey === today) return 'Bugun';

  const yesterday = uzDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());
  if (dayKey === yesterday) return 'Kecha';

  const [, month, day] = dayKey.split('-');
  return `${Number(day)} ${UZ_MONTHS[Number(month) - 1]}`;
}

export interface MovementDay {
  /** `2026-09-11`, Tashkent time. Stable across renders — safe as a React key. */
  key: string;
  label: string;
  inTiyin: number;
  outTiyin: number;
  movements: CardMovement[];
}

/**
 * Movements grouped into the days they happened on, newest day first.
 *
 * The grouping is by Tashkent date, not UTC: a payout at 01:34 local time is
 * 20:34 the previous day in UTC, and an admin reconciling against the bank's
 * own notices — which print local time — would find it filed under yesterday.
 *
 * Order within a day is preserved from the input, which the backend already
 * returns newest first.
 */
export function groupByDay(movements: CardMovement[], now: Date): MovementDay[] {
  const days = new Map<string, MovementDay>();

  for (const movement of movements) {
    const key = uzDayKey(movement.observedAt);
    let day = days.get(key);
    if (!day) {
      day = { key, label: dayLabel(key, now), inTiyin: 0, outTiyin: 0, movements: [] };
      days.set(key, day);
    }
    day.movements.push(movement);
    if (movement.direction === 'IN') day.inTiyin += movement.amountTiyin;
    else day.outTiyin += movement.amountTiyin;
  }

  return [...days.values()].sort((a, b) => b.key.localeCompare(a.key));
}

/**
 * The two bar widths for a day, as percentages of the busiest day on screen.
 *
 * Scaled across the whole page rather than per day: bars that each fill their
 * own row would make a 40 000 so'm day and a 4 000 000 so'm day look identical,
 * which is the opposite of what a glance down the column is for.
 */
export function dayBarWidths(
  day: MovementDay,
  days: MovementDay[],
): { inPercent: number; outPercent: number } {
  const busiest = Math.max(...days.map((d) => d.inTiyin + d.outTiyin), 0);
  if (busiest <= 0) return { inPercent: 0, outPercent: 0 };
  return {
    inPercent: (day.inTiyin / busiest) * 100,
    outPercent: (day.outTiyin / busiest) * 100,
  };
}
