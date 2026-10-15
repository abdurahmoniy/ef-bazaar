// frontend/src/lib/plans.test.ts
import { describe, expect, it } from 'vitest';
import {
  daysLeft, formatPlanDate, planAction, planEndDate, purchaseErrorFrom, slotCount, yearlySavingsPercent,
  type MyPlan, type PlanCatalogItem,
} from './plans';

const catalog: PlanCatalogItem[] = [
  { code: 'STANDARD', sortOrder: 1, entitlements: { 'mailbox.slots': '3' }, prices: {} },
  { code: 'PRO', sortOrder: 2, entitlements: { 'mailbox.slots': '5' }, prices: { MONTH: 1_000_000, YEAR: 10_000_000 } },
  { code: 'MAX', sortOrder: 3, entitlements: { 'mailbox.slots': null }, prices: { MONTH: 3_000_000, YEAR: 25_000_000 } },
];
const [standard, pro, max] = catalog;
const now = new Date('2026-05-01T00:00:00Z');
const free: MyPlan = { code: 'STANDARD', expiresAt: null, entitlements: {} };
const onPro: MyPlan = { code: 'PRO', expiresAt: '2026-05-11T00:00:00Z', entitlements: {} };

describe('plans', () => {
  it('counts slots and treats null as unlimited', () => {
    expect(slotCount(pro.entitlements, 'mailbox.slots')).toBe(5);
    expect(slotCount(max.entitlements, 'mailbox.slots')).toBeNull();
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
    expect(planAction(max, onPro, catalog, now)).toBe('upgrade');
    expect(planAction(standard, onPro, catalog, now)).toBe('unavailable');
    const onMax: MyPlan = { code: 'MAX', expiresAt: '2026-06-01T00:00:00Z', entitlements: {} };
    expect(planAction(pro, onMax, catalog, now)).toBe('unavailable');
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
    expect(planLabel({ code: 'STANDARD', expiresAt: null, entitlements: {} })).toBe('Jaydari');
    expect(planLabel({ code: 'PRO', expiresAt: '2030-01-10T00:00:00Z', entitlements: {} })).toBe('Boyvachcha · 10.01.2030 gacha');
  });
});
