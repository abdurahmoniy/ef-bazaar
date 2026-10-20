// frontend/src/lib/plans.test.ts
import { describe, expect, it } from 'vitest';
import {
  daysLeft, formatPlanDate, planAction, planEndDate, purchaseErrorFrom, slotCount, yearlySavingsPercent,
  type MyPlan, type PlanCatalogItem,
} from './plans';

const catalog: PlanCatalogItem[] = [
  { code: 'STANDARD', sortOrder: 1, entitlements: { 'mailbox.total_slots': '3' }, prices: {} },
  { code: 'PRO', sortOrder: 2, entitlements: { 'mailbox.total_slots': '10' }, prices: { MONTH: 1_000_000, YEAR: 10_000_000 } },
  { code: 'MAX', sortOrder: 3, entitlements: { 'mailbox.total_slots': null }, prices: { MONTH: 3_000_000, YEAR: 25_000_000 } },
];
const [standard, pro, max] = catalog;
const now = new Date('2026-05-01T00:00:00Z');
const free: MyPlan = { code: 'STANDARD', expiresAt: null, entitlements: {} };
const onPro: MyPlan = { code: 'PRO', expiresAt: '2026-05-11T00:00:00Z', entitlements: {} };

describe('plans', () => {
  it('counts slots and treats null as unlimited', () => {
    expect(slotCount(pro.entitlements, 'mailbox.total_slots')).toBe(10);
    expect(slotCount(max.entitlements, 'mailbox.total_slots')).toBeNull();
    expect(slotCount({}, 'mailbox.custom_slots')).toBe(0);
  });

  it('works out the yearly saving from the live prices, rounded to nearest', () => {
    expect(yearlySavingsPercent(pro.prices)).toBe(17); // 100k vs 120k = 16.67%
    expect(yearlySavingsPercent(max.prices)).toBe(31); // 250k vs 360k = 30.56%
    expect(yearlySavingsPercent({ MONTH: 1_000_000, YEAR: 12_000_000 })).toBeNull();
    expect(yearlySavingsPercent({})).toBeNull();
  });

  it('chooses the button for each card', () => {
    expect(planAction(standard, free, catalog, now)).toBe('current-free');
    expect(planAction(pro, free, catalog, now)).toBe('choose');
    expect(planAction(pro, onPro, catalog, now)).toBe('extend');
    expect(planAction(max, onPro, catalog, now)).toBe('unavailable');
    expect(planAction(standard, onPro, catalog, now)).toBe('unavailable');
    const onMax: MyPlan = { code: 'MAX', expiresAt: '2026-06-01T00:00:00Z', entitlements: {} };
    expect(planAction(pro, onMax, catalog, now)).toBe('unavailable');
    expect(planAction(pro, onMax, [standard, pro], now)).toBe('unavailable');
  });

  it('does not offer to extend an unlimited granted plan', () => {
    const unlimitedPro: MyPlan = { code: 'PRO', expiresAt: null, entitlements: {} };
    expect(planAction(pro, unlimitedPro, catalog, now)).toBe('unlimited-current');
    expect(planAction(max, unlimitedPro, catalog, now)).toBe('unavailable');
  });

  it('offers nothing to buy to an admin on STAFF', () => {
    const staff: MyPlan = { code: 'STAFF', expiresAt: null, entitlements: {} };
    for (const target of catalog) expect(planAction(target, staff, catalog, now)).toBe('staff');
  });

  it('treats an expired plan as free', () => {
    const expired: MyPlan = { code: 'MAX', expiresAt: '2026-04-01T00:00:00Z', entitlements: {} };
    expect(planAction(pro, expired, catalog, now)).toBe('choose');
  });

  it('counts whole days left, rounding up', () => {
    expect(daysLeft('2026-05-11T00:00:00Z', now)).toBe(10);
    expect(daysLeft('2026-05-01T05:00:00Z', now)).toBe(1);
    expect(daysLeft(null, now)).toBeNull();
  });

  it('maps server refusals to what the screen does next', () => {
    expect(purchaseErrorFrom(409, { detail: "Hamyonda mablag' yetarli emas — 6000 so'm yetishmayapti" }))
      .toEqual({ kind: 'insufficient', message: "Hamyonda mablag' yetarli emas — 6000 so'm yetishmayapti" });
    expect(purchaseErrorFrom(409, { code: 'price_changed', currentPriceTiyin: 1_500_000, detail: 'x' }))
      .toEqual({ kind: 'price_changed', currentPriceTiyin: 1_500_000 });
    expect(purchaseErrorFrom(409, { code: 'downgrade_not_allowed', detail: 'Pastroq…' }))
      .toEqual({ kind: 'other', message: 'Pastroq…' });
    expect(purchaseErrorFrom(409, { code: 'staff_unlimited' }))
      .toEqual({ kind: 'other', message: 'Admin sifatida barcha imkoniyatlar cheklovsiz' });
    expect(purchaseErrorFrom(502, {})).toEqual({ kind: 'other', message: "So'rov bajarilmadi (502)" });
  });

  it('formats dates in Tashkent time and projects the end date', () => {
    expect(formatPlanDate('2026-05-31T20:00:00Z')).toBe('01.06.2026');
    expect(formatPlanDate(planEndDate('extend', onPro, 'MONTH', now))).toBe('11.06.2026');
    expect(formatPlanDate(planEndDate('choose', free, 'YEAR', now))).toBe('01.05.2027');
  });
});

describe('planLabel', () => {
  it('is neutral when the plan is unknown', async () => {
    const { planLabel } = await import('./plans');
    expect(planLabel(null)).toBe('—');
    expect(planLabel({ code: 'STANDARD', expiresAt: null, entitlements: {} })).toBe('Free');
    expect(planLabel({ code: 'STAFF', expiresAt: null, entitlements: {} })).toBe('Admin');
    expect(planLabel({ code: 'PRO', expiresAt: '2030-01-10T00:00:00Z', entitlements: {} })).toBe('Pro · 10.01.2030 gacha');
  });
});

 it('does not turn the legacy random allowance into a total capacity', async () => {
   const { SLOTS_KEY } = await import('./plans');
   expect(slotCount({ 'mailbox.slots': '5', 'mailbox.custom_slots': '1' }, SLOTS_KEY)).toBe(0);
 });


it('does not label an expired paid subscription as active in the profile', async () => {
  const { planLabel } = await import('./plans');
  expect(planLabel({ code: 'PRO', expiresAt: '2000-01-01T00:00:00Z', entitlements: {} })).toBe('Free · Pro muddati tugagan');
});


it('derives product benefits only from valid published grants', async () => {
  const { planBenefits, numericGrant } = await import('./plans');
  const item: PlanCatalogItem = { code: 'PRO', sortOrder: 1, prices: {}, entitlements: {
    'watch.search_limit': '7', 'watch.price_limit': '21', 'watch.immediate': 'true',
    'analytics.history_days': '30', 'analytics.export': 'true', 'seller.tools': 'true',
    'profile.decoration': 'false',
  } };
  expect(planBenefits(item)).toContain('7 ta saqlangan qidiruv');
  expect(planBenefits(item)).toContain('21 ta narx kuzatuvi');
  expect(planBenefits(item)).toContain('30 kungacha mavjud tarix');
  expect(planBenefits(item)).not.toContain('Profil uchun shaxsiy muqova');
  expect(numericGrant(item, 'missing')).toBeUndefined();
  expect(numericGrant({ ...item, entitlements: { x: '2more' } }, 'x')).toBeUndefined();
  expect(numericGrant({ ...item, entitlements: { x: null } }, 'x')).toBeNull();
});
