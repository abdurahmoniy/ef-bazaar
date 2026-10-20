import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { membershipState, type MyPlan, type PlanCatalogItem } from '@/lib/plans';
import { ProfileMembership } from './profile-membership';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const now = new Date('2026-10-20T12:00:00Z');
const pro: MyPlan = { code: 'PRO', expiresAt: '2026-11-20T12:00:00Z', entitlements: {} };
const free: MyPlan = { code: 'STANDARD', expiresAt: null, entitlements: {} };
const catalog: PlanCatalogItem[] = [{ code: 'PRO', sortOrder: 2, prices: { MONTH: 4_000_000 }, entitlements: {} }];
const html = (plan: MyPlan | null) => renderToStaticMarkup(createElement(ProfileMembership, { plan, catalog, displayName: 'Azizbek', now }));
it('promotes Free with the actual API price and explicit upgrade destination', () => {
  const s = html(free);
  expect(s).toContain('Free'); expect(s).toContain('Pro’ga o‘tish');
  expect(s).toContain('/plans?intent=pro#pro'); expect(s).toContain('40 000'); expect(s).not.toContain('30 000');
});
it('shows paid membership and expiry without claiming service readiness or verified trust', () => {
  const s = html(pro);
  expect(s).toContain('Pro faol'); expect(s).toContain('20.11.2026');
  expect(s).toContain('Pro’ni uzaytirish'); expect(s).not.toContain('Pro’ga o‘tish');
  expect(s).not.toContain('barcha imkoniyatlar ochiq'); expect(s).not.toContain('Tasdiqlangan');
});
it('keeps unlimited and staff plans out of paid upgrade flows', () => {
  for (const plan of [{ ...pro, expiresAt: null }, { ...free, code: 'STAFF' as const }]) {
    const s = html(plan); expect(s).not.toContain('Pro’ga o‘tish'); expect(s).not.toContain('Pro’ni uzaytirish');
  }
});
it('does not infer Free or sell when payment membership is unknown', () => {
  const s = html(null); expect(s).toContain('Tarif aniqlanmadi'); expect(s).toContain('Qayta urinish');
  expect(s).not.toContain('Pro’ga o‘tish'); expect(s).not.toContain('Pro faol');
});
it('keeps expired membership honest and Grace visible', () => {
  const expired = { ...pro, expiresAt: '2026-10-01T00:00:00Z' };
  expect(html(expired)).toContain('Pro muddati tugagan'); expect(html(expired)).not.toContain('Pro faol');
  const grace = { ...free, lastPaidExpiresAt: expired.expiresAt, graceEndsAt: '2026-10-31T00:00:00Z' };
  expect(html(grace)).toContain('31.10.2026'); expect(html(grace)).toContain('Grace');
});
it('uses the actual deadline including malformed, unlimited and historical plans', () => {
  expect(membershipState({ ...pro, expiresAt: 'invalid' }, now)).toBe('unknown');
  expect(membershipState({ ...pro, expiresAt: null }, now)).toBe('unlimited');
  expect(membershipState({ ...pro, code: 'MAX' }, now)).toBe('active');
  expect(membershipState({ ...free, lastPaidExpiresAt: '2026-09-01T00:00:00Z', graceEndsAt: '2026-10-01T00:00:00Z' }, now)).toBe('recovery');
});

it('does not offer a closed renewal on historical MAX or call its expiry Pro', () => {
  expect(html({ ...pro, code: 'MAX' })).not.toContain('Uzaytirsangiz');
  expect(html({ ...pro, code: 'MAX', expiresAt: '2000-01-01T00:00:00Z' })).toContain('MAX muddati tugagan');
  expect(html({ ...free, lastPaidExpiresAt: '2026-09-01T00:00:00Z' })).toContain('Pullik tarif muddati tugagan');
});

it('moves a stale paid record from Grace into Recovery at the Grace deadline', () => {
  expect(membershipState({ ...pro, expiresAt: '2026-10-01T00:00:00Z', graceEndsAt: '2026-10-10T00:00:00Z' }, now)).toBe('recovery');
});
