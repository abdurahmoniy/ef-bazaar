// @vitest-environment jsdom
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/admin/user-picker', () => ({ UserPicker: () => null }));
vi.mock('@/lib/plans-admin', async () => ({
  ...await vi.importActual<typeof import('@/lib/plans-admin')>('@/lib/plans-admin'),
  updatePlanPrices: mocks.update,
}));
import type { PlanPriceRow } from '@/lib/plans-admin';
import { AdminPlanPrices } from './admin-plan-prices';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
const rows: PlanPriceRow[] = [
  { planCode: 'PRO', period: 'MONTH', priceTiyin: 3_000_000, updatedBy: null, updatedAt: '2026-10-19T00:00:00Z' },
  { planCode: 'PRO', period: 'YEAR', priceTiyin: 10_000_000, updatedBy: null, updatedAt: '2026-10-19T00:00:00Z' },
  { planCode: 'MAX', period: 'MONTH', priceTiyin: 3_000_000, updatedBy: null, updatedAt: '2026-10-19T00:00:00Z' },
];
beforeEach(() => {
  mocks.update.mockReset().mockResolvedValue(rows);
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  act(() => root.render(createElement(AdminPlanPrices, { initial: rows })));
});
afterEach(() => { act(() => root.unmount()); host.remove(); });
it('edits and saves only Pro MONTH even if the response contains historical prices', async () => {
  expect(host.querySelectorAll('input[id^="price-"]')).toHaveLength(1);
  expect(host.querySelector<HTMLInputElement>('#price-PRO-MONTH')?.value).toBe('30\u00a0000');
  expect([...host.querySelectorAll('#assign-plan option')].map((o) => o.getAttribute('value'))).toEqual(['PRO', 'STANDARD']);
  const save = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Narxlarni saqlash')!;
  await act(async () => save.click());
  expect(mocks.update).toHaveBeenCalledWith([{ planCode: 'PRO', period: 'MONTH', priceTiyin: 3_000_000 }]);
});
