// @vitest-environment jsdom
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MyPlan, PlanCatalogItem } from '@/lib/plans';

const mocks = vi.hoisted(() => ({
  purchasePlan: vi.fn(),
  getWallet: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }) }));
vi.mock('next/link', () => ({
  default: (p: { href: string; children: unknown }) => createElement('a', { href: p.href }, p.children as string),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/payment-client', () => ({ getWallet: mocks.getWallet }));
vi.mock('@/lib/plans-client', async () => {
  const { PlanPurchaseError } = await vi.importActual<typeof import('@/lib/plans-client')>(
    '@/lib/plans-client',
  );
  return { PlanPurchaseError, purchasePlan: mocks.purchasePlan };
});

import { PlanPurchaseError } from '@/lib/plans-client';
import { PlansView } from './plans-view';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const catalog: PlanCatalogItem[] = [
  { code: 'STANDARD', sortOrder: 1, entitlements: { 'mailbox.slots': '3' }, prices: {} },
  { code: 'PRO', sortOrder: 2, entitlements: { 'mailbox.slots': '5' }, prices: { MONTH: 1_000_000, YEAR: 10_000_000 } },
  { code: 'MAX', sortOrder: 3, entitlements: { 'mailbox.slots': null }, prices: { MONTH: 3_000_000, YEAR: 25_000_000 } },
];
const free: MyPlan = { code: 'STANDARD', expiresAt: null, entitlements: {} };
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

let root: Root;
let host: HTMLElement;

async function mount(mine: MyPlan | null, signedIn = true) {
  await act(async () => {
    root.render(createElement(PlansView, { catalog, mine, signedIn }));
  });
}
const button = (label: string) =>
  [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes(label));
async function click(label: string) {
  const b = button(label);
  if (!b) throw new Error(`no button ${label}`);
  await act(async () => {
    b.click();
  });
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  mocks.purchasePlan.mockReset();
  mocks.getWallet.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = '';
});

describe('PlansView', () => {
  it('reuses one idempotency key when the same purchase is retried', async () => {
    mocks.purchasePlan.mockRejectedValue(new PlanPurchaseError({ kind: 'other', message: 'x' }));
    await mount(free);
    await click('Tanlash');
    await click('Tanlash');
    expect(mocks.purchasePlan).toHaveBeenCalledTimes(2);
    const [a, b] = mocks.purchasePlan.mock.calls.map((c) => c[0]);
    expect(a.idempotencyKey).toBeTruthy();
    expect(b.idempotencyKey).toBe(a.idempotencyKey);
  });

  it('re-confirms at the new price after price_changed, without the burn warning', async () => {
    mocks.purchasePlan
      .mockRejectedValueOnce(new PlanPurchaseError({ kind: 'price_changed', currentPriceTiyin: 1_500_000 }))
      .mockResolvedValueOnce(free);
    await mount(free);
    await click('Tanlash');
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Narx o‘zgardi: 15 000 so‘m');
    expect(dialog?.textContent).not.toContain('kuni kuyadi');
    await click('Tanlash');
    expect(mocks.purchasePlan.mock.calls[1][0].expectedPriceTiyin).toBe(1_500_000);
  });

  it('extend never warns about burning days', async () => {
    const onPro: MyPlan = { code: 'PRO', expiresAt: inDays(10), entitlements: {} };
    mocks.purchasePlan.mockRejectedValueOnce(
      new PlanPurchaseError({ kind: 'price_changed', currentPriceTiyin: 1_200_000 }),
    );
    await mount(onPro);
    await click('Uzaytirish');
    const text = document.body.querySelector('[role="dialog"]')?.textContent ?? '';
    expect(text).toContain('uzayadi');
    expect(text).not.toContain('kuyadi');
  });

  it('upgrade shows the burn warning with the days left', async () => {
    const onPro: MyPlan = { code: 'PRO', expiresAt: inDays(12), entitlements: {} };
    await mount(onPro);
    await click('Oshirish');
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('qolgan 12 kuni kuyadi');
  });

  it('links to the wallet top-up when funds are short', async () => {
    mocks.purchasePlan.mockRejectedValue(
      new PlanPurchaseError({ kind: 'insufficient', message: "Hamyonda mablag' yetarli emas" }),
    );
    mocks.getWallet.mockResolvedValue({ availableTiyin: 0 });
    await mount(free);
    await click('Tanlash');
    const link = document.body.querySelector('a[href^="/hamyon"]');
    expect(link?.getAttribute('href')).toContain('toldirish=10000');
  });

  it('does not offer purchase when the signed-in user\'s plan is unknown', async () => {
    await mount(null, true);
    expect(button('Tanlash')).toBeUndefined();
    expect(document.body.textContent).toContain('Qayta urinish');
  });

  it('does not call the free plan current for anonymous visitors', async () => {
    await mount(null, false);
    expect(document.body.textContent).not.toContain('Joriy tarif');
  });
});
