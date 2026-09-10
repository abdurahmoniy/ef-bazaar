import type {
  PaymentAnalyticsOverview,
  RevenueFlowRow,
  TransactionKind,
} from './payment-types';

/**
 * The two data colours of this dashboard, and the only two it has.
 *
 * Checked with the dataviz validator against both the light and the dark
 * surface: normal-vision ΔE 21.2, deuteranopia 16.3. They are never the sole
 * carrier of meaning — every segment is labelled — but they hold up if someone
 * reads the bar before the label.
 */
export const MONEY_COLORS = {
  /** The platform's own share. */
  own: '#059669',
  /** What is owed to users. */
  users: '#6C7FD4',
} as const;

/**
 * Kind names from the platform's side of the table.
 *
 * Deliberately not `WALLET_KIND_LABELS`: those are written for the user whose
 * wallet it is. "Referal bonus" is what the referrer received; on this screen
 * the same row is money the platform spent, and calling it a bonus reads as
 * income.
 */
const PLATFORM_KIND_LABELS: Partial<Record<TransactionKind, string>> = {
  TRADE_SETTLE: 'Savdo komissiyasi',
  DEPOSIT: "To'ldirish farqi",
  PARTNER_FEE: 'Hamkorlik to‘lovi',
  REFERRAL_REWARD: 'Referal mukofoti',
  PARTNER_POST_SETTLE: 'Kanal postlari',
  PARTNER_TRADE_SHARE: 'Hamkor ulushi (savdodan)',
  PARTNER_MONTHLY: 'Hamkorga oylik',
  ADJUSTMENT: 'Admin tuzatishi',
};

/** payment-service may grow a kind this build predates — name it, don't drop it. */
const UNKNOWN_KIND_LABEL = 'Boshqa amaliyot';

export function platformKindLabel(kind: TransactionKind): string {
  return PLATFORM_KIND_LABELS[kind] ?? UNKNOWN_KIND_LABEL;
}

export interface MoneySlice {
  label: string;
  tiyin: number;
  /** Width of this slice of the bar, already clamped to a sane range. */
  percent: number;
  color: string;
}

/**
 * The cards' money, split into whose it is.
 *
 * <p>`platformOwn` can be negative: referral rewards come out of equity, so
 * while the platform is buying growth the cards can hold less than users are
 * owed. That is a real state with a real consequence — the shortfall has to be
 * covered from somewhere — so it is reported rather than clamped, and
 * {@link shortfallTiyin} is how the screen asks about it.
 */
export function moneySplit(o: PaymentAnalyticsOverview): MoneySlice[] {
  const own = Math.max(o.platformOwnTiyin, 0);
  const total = o.usersTotalTiyin + own;
  // An empty ledger has nothing to divide. Splitting it in half would draw a
  // bar claiming a 50/50 balance over zero so'm.
  const share = (part: number) => (total > 0 ? (part / total) * 100 : 0);

  return [
    {
      label: 'Foydalanuvchilar puli',
      tiyin: o.usersTotalTiyin,
      percent: share(o.usersTotalTiyin),
      color: MONEY_COLORS.users,
    },
    {
      label: 'Platformaning o‘zi',
      tiyin: own,
      percent: share(own),
      color: MONEY_COLORS.own,
    },
  ];
}

/**
 * How much the cards are short of what users are owed, or 0 when they are not.
 *
 * Not framed as an error. It is the amount the platform has to cover from
 * elsewhere — which, while referral spending runs ahead of commission, is the
 * expected way to run.
 */
export function shortfallTiyin(o: PaymentAnalyticsOverview): number {
  return o.platformOwnTiyin < 0 ? -o.platformOwnTiyin : 0;
}

export type DriftVerdict =
  | { kind: 'unknown'; unobservedCards: number }
  | { kind: 'match' }
  | { kind: 'drift'; tiyin: number };

/**
 * Whether the cards actually hold what the ledger says they hold.
 *
 * This is the only check on this screen that can fail, and it is worth having:
 * the ledger balances against itself by construction, so nothing else here can
 * ever disagree with anything. The userbot's reading is the one number that
 * comes from outside the books.
 *
 * A card that has never reported a balance makes the comparison meaningless
 * rather than merely inaccurate — the observed total is short by an unknown
 * amount — so it answers `unknown` instead of a difference nobody should act on.
 */
export function ledgerDrift(o: PaymentAnalyticsOverview): DriftVerdict {
  if (o.unobservedCards > 0) {
    return { kind: 'unknown', unobservedCards: o.unobservedCards };
  }
  const diff = o.observedCardsTiyin - o.ledgerCardsTiyin;
  return diff === 0 ? { kind: 'match' } : { kind: 'drift', tiyin: diff };
}

export interface ProfitRow {
  kind: TransactionKind;
  label: string;
  /** Positive both ways; `direction` says which. */
  tiyin: number;
  direction: 'in' | 'out';
  /** Share of the largest row, for the bar width. */
  percent: number;
}

/**
 * The profit breakdown, biggest bar first.
 *
 * Every kind that moved equity gets a row, including ones this build has no
 * name for: a total that silently omits a row is worse than one with a row
 * called "Boshqa amaliyot".
 *
 * Bars are scaled to the largest row rather than to the total, because the
 * total of a mixed in/out list is not a length anything can be a fraction of.
 */
export function profitRows(rows: RevenueFlowRow[]): ProfitRow[] {
  const flat: Omit<ProfitRow, 'percent'>[] = [];
  for (const row of rows) {
    const label = platformKindLabel(row.kind);
    if (row.inTiyin > 0) {
      flat.push({ kind: row.kind, label, tiyin: row.inTiyin, direction: 'in' });
    }
    if (row.outTiyin > 0) {
      flat.push({ kind: row.kind, label, tiyin: row.outTiyin, direction: 'out' });
    }
  }
  const top = Math.max(...flat.map((r) => r.tiyin), 0);
  return flat
    .sort((a, b) => b.tiyin - a.tiyin)
    .map((r) => ({ ...r, percent: top > 0 ? (r.tiyin / top) * 100 : 0 }));
}

/** `cardId` → settled volume, for joining onto the card list. */
export function throughputByCardId(
  o: PaymentAnalyticsOverview,
): Map<string, { throughputTiyin: number; paidInvoices: number }> {
  return new Map(
    o.cardThroughput.map((row) => [
      row.cardId,
      { throughputTiyin: row.throughputTiyin, paidInvoices: row.paidInvoices },
    ]),
  );
}

/**
 * How many tiyin of every 100 so'm earned went back out as referral reward.
 *
 * `null` when nothing has been earned yet — a ratio against zero is not
 * "0%", it is a question that has no answer, and printing 0% would say
 * referral spending is under control when nothing has been measured.
 */
export function referralPer100(o: PaymentAnalyticsOverview): number | null {
  if (o.revenueInTiyin <= 0) return null;
  return Math.round((o.referralRewardTiyin / o.revenueInTiyin) * 100);
}
