import { isInsufficientFunds } from './wallet-shortfall';

export type PlanCode = 'STANDARD' | 'PRO' | 'MAX' | 'STAFF';
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
  lastPaidExpiresAt?: string | null;
  graceEndsAt?: string | null;
  code: PlanCode;
  expiresAt: string | null;
  entitlements: Record<string, string | null>;
}

/** Backend codes stay English; these are the only place the names live. */
export const PLAN_NAMES: Record<PlanCode, string> = {
  STANDARD: 'Free',
  PRO: 'Pro',
  MAX: 'MAX (arxiv)',
  STAFF: 'Admin',
};

/** Shown instead of a price list when the user is an admin. */
export const STAFF_UNLIMITED_MESSAGE = 'Admin sifatida barcha imkoniyatlar cheklovsiz';

export const SLOTS_KEY = 'mailbox.total_slots';
export const CUSTOM_SLOTS_KEY = 'mailbox.custom_slots';

/** null = unlimited; a missing key = the plan does not grant it (0). */
export function slotCount(entitlements: Record<string, string | null>, key: string): number | null {
  if (!(key in entitlements)) return 0;
  const v = entitlements[key];
  if (v === null) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Missing or malformed unified grants are unavailable, never a zero or legacy fallback. */
export function mailboxCapacity(entitlements: Record<string, string | null>): { total: number | null; custom: number | null } | null {
  const valid = (key: string) => Object.prototype.hasOwnProperty.call(entitlements, key)
    && (entitlements[key] === null || (typeof entitlements[key] === 'string'
      && /^\d+$/.test(entitlements[key]) && Number.isSafeInteger(Number(entitlements[key]))));
  if (!valid(SLOTS_KEY) || !valid(CUSTOM_SLOTS_KEY)) return null;
  return { total: slotCount(entitlements, SLOTS_KEY), custom: slotCount(entitlements, CUSTOM_SLOTS_KEY) };
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

export type PlanAction =
  | 'choose' | 'extend' | 'upgrade' | 'unavailable' | 'current-free' | 'unlimited-current' | 'staff';

export function planAction(
  target: PlanCatalogItem,
  mine: MyPlan,
  catalog: PlanCatalogItem[],
  now: Date,
): PlanAction {
  // An admin has everything already; nothing on the page is for them to buy.
  if (mine.code === 'STAFF') return 'staff';
  if (target.code === 'MAX' || target.code === 'STAFF') return 'unavailable';
  const live = isLive(mine, now);
  if (target.code === 'STANDARD') return live ? 'unavailable' : 'current-free';
  if (!live) return 'choose';
  // An admin-granted plan has no end to push back; buying would only burn money.
  if (target.code === mine.code) return mine.expiresAt === null ? 'unlimited-current' : 'extend';
  const currentOrder = catalog.find((p) => p.code === mine.code)?.sortOrder;
  // Retired or unknown active plans must never be treated as lower than Pro.
  if (currentOrder === undefined) return 'unavailable';
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
  if (b.code === 'staff_unlimited') return { kind: 'other', message: STAFF_UNLIMITED_MESSAGE };
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

/** Profile plan row; null (plan lookup failed) is neutral, never "Free". */
export function planLabel(mine: MyPlan | null): string {
  if (!mine) return '—';
  const state = membershipState(mine);
  if (state === 'expired' || state === 'grace' || state === 'recovery') return `Free · ${expiredPlanName(mine)} muddati tugagan`;
  if (state === 'unknown') return '—';
  if (mine.code === 'STANDARD' || mine.code === 'STAFF') return PLAN_NAMES[mine.code];
  return mine.expiresAt
    ? `${PLAN_NAMES[mine.code]} · ${formatPlanDate(mine.expiresAt)} gacha`
    : PLAN_NAMES[mine.code];
}

export type MembershipState = 'unknown' | 'free' | 'active' | 'unlimited' | 'staff' | 'grace' | 'expired' | 'recovery';

/** Payment membership only. Individual services still decide feature readiness. */
export function membershipState(mine: MyPlan | null, now = new Date()): MembershipState {
  if (!mine) return 'unknown';
  if (mine.code === 'STAFF') return 'staff';
  if (mine.code !== 'STANDARD') {
    if (mine.expiresAt === null) return 'unlimited';
    const end = Date.parse(mine.expiresAt);
    if (!Number.isFinite(end)) return 'unknown';
    if (end > now.getTime()) return 'active';
    if (mine.graceEndsAt && Number.isFinite(Date.parse(mine.graceEndsAt))) {
      return Date.parse(mine.graceEndsAt) > now.getTime() ? 'grace' : 'recovery';
    }
    return 'expired';
  }
  if (mine.graceEndsAt && Date.parse(mine.graceEndsAt) > now.getTime()) return 'grace';
  return mine.lastPaidExpiresAt ? 'recovery' : 'free';
}

/** Missing or malformed product grants are unknown, not disabled or unlimited. */
export function numericGrant(item: PlanCatalogItem, key: string): number | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(item.entitlements, key)) return undefined;
  const value = item.entitlements[key];
  if (value === null) return null;
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : undefined;
}

export function planBenefits(item: PlanCatalogItem): string[] {
  const features: string[] = [];
  const searches = numericGrant(item, 'watch.search_limit');
  const watches = numericGrant(item, 'watch.price_limit');
  const history = numericGrant(item, 'analytics.history_days');
  if (searches === null || (searches !== undefined && searches > 0)) features.push(`${searches === null ? 'Cheksiz' : `${searches} ta`} saqlangan qidiruv`);
  if (watches === null || (watches !== undefined && watches > 0)) features.push(`${watches === null ? 'Cheksiz' : `${watches} ta`} narx kuzatuvi`);
  if (item.entitlements['watch.immediate'] === 'true') features.push('Mos yangilik topilganda xabar');
  else if (item.entitlements['watch.immediate'] === 'false') features.push('Kuzatuvlardan kunlik jamlanma');
  if (history === null || (history !== undefined && history > 0)) features.push(history === null ? 'Mavjud sotuvlar tarixi' : `${history} kungacha mavjud tarix`);
  if (item.entitlements['analytics.export'] === 'true') features.push('Sotuvchi hisoboti va CSV eksport');
  if (item.entitlements['seller.tools'] === 'true') features.push('Shaxsiy qaydlar va javob shablonlari');
  if (item.entitlements['seller.bulk'] === 'true') features.push('Narx va bozordan olishni guruhlab boshqarish');
  if (item.entitlements['profile.decoration'] === 'true') features.push('Profil uchun shaxsiy muqova');
  return features;
}

/** Historical payment records do not always retain the last paid plan code. */
export function expiredPlanName(mine: MyPlan): string {
  return mine.code === 'PRO' ? 'Pro' : mine.code === 'MAX' ? 'MAX' : 'Pullik tarif';
}
