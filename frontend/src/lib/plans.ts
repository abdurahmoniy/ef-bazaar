import { isInsufficientFunds } from './wallet-shortfall';

export type PlanCode = 'STANDARD' | 'PRO' | 'MAX';
export type PlanPeriod = 'MONTH' | 'YEAR';

export interface PlanCatalogItem {
  code: PlanCode;
  sortOrder: number;
  /** null value = unlimited. */
  entitlements: Record<string, string | null>;
  /** Empty for the free plan. Tiyin. */
  prices: Partial<Record<PlanPeriod, number>>;
}

export interface MyPlan {
  code: PlanCode;
  expiresAt: string | null;
  entitlements: Record<string, string | null>;
}

/** Backend codes stay English; these are the only place the names live. */
export const PLAN_NAMES: Record<PlanCode, string> = {
  STANDARD: 'Jaydari',
  PRO: 'Boyvachcha',
  MAX: 'Aristokrat',
};

export const SLOTS_KEY = 'mailbox.slots';
export const CUSTOM_SLOTS_KEY = 'mailbox.custom_slots';

/** null = unlimited; a missing key = the plan does not grant it (0). */
export function slotCount(entitlements: Record<string, string | null>, key: string): number | null {
  if (!(key in entitlements)) return 0;
  const v = entitlements[key];
  if (v === null) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Computed from live prices so an admin edit never leaves a stale badge. */
export function yearlySavingsPercent(prices: Partial<Record<PlanPeriod, number>>): number | null {
  const month = prices.MONTH;
  const year = prices.YEAR;
  if (!month || !year) return null;
  const full = month * 12;
  if (year >= full) return null;
  return Math.round(((full - year) / full) * 100);
}

function isLive(mine: MyPlan, now: Date): boolean {
  if (mine.code === 'STANDARD') return false;
  return mine.expiresAt === null || new Date(mine.expiresAt).getTime() > now.getTime();
}

export type PlanAction = 'choose' | 'extend' | 'upgrade' | 'unavailable' | 'current-free';

export function planAction(
  target: PlanCatalogItem,
  mine: MyPlan,
  catalog: PlanCatalogItem[],
  now: Date,
): PlanAction {
  const live = isLive(mine, now);
  if (target.code === 'STANDARD') return live ? 'unavailable' : 'current-free';
  if (!live) return 'choose';
  if (target.code === mine.code) return 'extend';
  const currentOrder = catalog.find((p) => p.code === mine.code)?.sortOrder ?? 0;
  return target.sortOrder > currentOrder ? 'upgrade' : 'unavailable';
}

export function daysLeft(expiresAt: string | null, now: Date): number | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

export type PurchaseError =
  | { kind: 'insufficient'; message: string }
  | { kind: 'price_changed'; currentPriceTiyin: number }
  | { kind: 'other'; message: string };

export function purchaseErrorFrom(status: number, body: unknown): PurchaseError {
  const b = (body ?? {}) as { code?: string; detail?: string; message?: string; currentPriceTiyin?: number };
  const message = b.detail || b.message || `So'rov bajarilmadi (${status})`;
  if (b.code === 'price_changed' && typeof b.currentPriceTiyin === 'number') {
    return { kind: 'price_changed', currentPriceTiyin: b.currentPriceTiyin };
  }
  if (isInsufficientFunds(message)) return { kind: 'insufficient', message };
  return { kind: 'other', message };
}

const TASHKENT_OFFSET_MS = 5 * 3_600_000;

/** dd.MM.yyyy in Tashkent time — fixed so server and browser render identically. */
export function formatPlanDate(iso: string | Date): string {
  const t = new Date((typeof iso === 'string' ? new Date(iso) : iso).getTime() + TASHKENT_OFFSET_MS);
  const dd = String(t.getUTCDate()).padStart(2, '0');
  const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${t.getUTCFullYear()}`;
}

/**
 * When the plan would end if bought now: an extension counts from the current
 * expiry, anything else from now (the backend rule), plus one month/year.
 * Approximate — the server decides the exact instant.
 */
export function planEndDate(
  action: PlanAction,
  mine: MyPlan,
  period: PlanPeriod,
  now: Date,
): Date {
  const expiry = mine.expiresAt ? new Date(mine.expiresAt) : null;
  const base = action === 'extend' && expiry && expiry.getTime() > now.getTime() ? expiry : now;
  const end = new Date(base.getTime());
  if (period === 'YEAR') end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return end;
}
