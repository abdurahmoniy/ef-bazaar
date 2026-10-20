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
  success: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }) }));
vi.mock('next/link', () => ({
  default: (p: { href: string; children: unknown }) => createElement('a', { href: p.href }, p.children as string),
}));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: vi.fn() } }));
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
  { code: 'STANDARD', sortOrder: 1, entitlements: { 'mailbox.total_slots': '3', 'mailbox.custom_slots': '0' }, prices: {} },
  { code: 'PRO', sortOrder: 2, entitlements: { 'mailbox.total_slots': '10', 'mailbox.custom_slots': '2' }, prices: { MONTH: 3_000_000, YEAR: 10_000_000 } },
  { code: 'MAX', sortOrder: 3, entitlements: { 'mailbox.total_slots': null, 'mailbox.custom_slots': '3' }, prices: { MONTH: 3_000_000, YEAR: 25_000_000 } },
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

const dialogButton = (label: string) =>
  [...(document.body.querySelector('[role="dialog"]')?.querySelectorAll('button') ?? [])].find((b) =>
    b.textContent?.includes(label),
  );
async function clickInDialog(label: string) {
  const b = dialogButton(label);
  if (!b) throw new Error(`no dialog button ${label}`);
  await act(async () => {
    b.click();
  });
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  mocks.purchasePlan.mockReset();
  mocks.getWallet.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('PlansView', () => {
  it('shows only Free and Pro with live capabilities, monthly prices and no artwork', async () => {
    await mount(free);
    const cards = [...host.querySelectorAll('article')];
    expect(cards).toHaveLength(2);
    expect(cards[0].getAttribute('aria-label')).toBe('Free tarifi');
    expect(cards[1].getAttribute('aria-label')).toBe('Pro tarifi');
    expect(cards[1].textContent).toContain('10 ta jami pochta qutisi');
    expect(cards[1].textContent).toContain('Shundan 2 ta yangi shaxsiy email');
    expect(cards[1].textContent).toContain('30\u00a0000');
    expect(host.querySelector('img')).toBeNull();
    expect(button('Yillik')).toBeUndefined();
    expect(host.textContent).toContain('Pro’da shu 10 ta ichida 2 tagacha');
  });

  it('purchases only the monthly live price and reports activation pending', async () => {
    mocks.purchasePlan.mockResolvedValue({ code: 'PRO', expiresAt: inDays(30), entitlements: {} });
    await mount(free);
    await click('Tanlash');
    expect(mocks.purchasePlan).toHaveBeenLastCalledWith(expect.objectContaining({
      planCode: 'PRO', period: 'MONTH', expectedPriceTiyin: 3_000_000,
    }));
    expect(mocks.success).toHaveBeenLastCalledWith('Xarid qabul qilindi. Pro imkoniyatlari faollashtirilmoqda.');
    expect(host.querySelector('[role="status"]')?.textContent).toContain('faollashtirilmoqda');
    expect(button('Tanlash')).toBeUndefined();
  });

  it('explains expiry and manual renewal in accessible expandable help', async () => {
    await mount(free);
    const expiry = [...host.querySelectorAll('details')].find((d) =>
      d.querySelector('summary')?.textContent?.includes('Tarif tugasa'),
    );
    expect(expiry?.textContent).toContain('o‘chirilmaydi');
    expect(expiry?.textContent).toContain('30 kun');
    expect(expiry?.textContent).toContain('Recovery');
    expect(expiry?.textContent).toContain('xavfsizlik');
    expect(host.textContent).toContain('Avtomatik pul yechilmaydi');
  });

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
    await clickInDialog('Tanlash');
    expect(mocks.purchasePlan).toHaveBeenCalledTimes(2);
    expect(mocks.purchasePlan.mock.calls[1][0].expectedPriceTiyin).toBe(1_500_000);
  });

  it('charges once when the dialog confirm is clicked twice while in flight', async () => {
    const onPro: MyPlan = { code: 'PRO', expiresAt: inDays(12), entitlements: {} };
    let finish!: (p: MyPlan) => void;
    mocks.purchasePlan.mockReturnValue(new Promise<MyPlan>((r) => { finish = r; }));
    await mount(onPro);
    mocks.purchasePlan.mockRejectedValueOnce(new PlanPurchaseError({ kind: 'price_changed', currentPriceTiyin: 3_100_000 }));
    await click('Uzaytirish');
    await clickInDialog('Uzaytirish');
    expect(dialogButton('Kuting')?.hasAttribute('disabled')).toBe(true);
    await clickInDialog('Kuting');
    await clickInDialog('Kuting');
    expect(mocks.purchasePlan).toHaveBeenCalledTimes(2);
    await act(async () => finish(onPro));
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

  it('does not sell Pro as an upgrade from a live historical MAX subscription', async () => {
    await mount({ code: 'MAX', expiresAt: inDays(10), entitlements: {} });
    expect(button('Oshirish')).toBeUndefined();
    expect(button('Tanlash')).toBeUndefined();
    expect(button('Uzaytirish')).toBeUndefined();
  });

  it('an unlimited granted plan offers no extend button on its own card', async () => {
    const unlimitedPro: MyPlan = { code: 'PRO', expiresAt: null, entitlements: {} };
    await mount(unlimitedPro);
    expect(button('Uzaytirish')).toBeUndefined();
    expect(button('Muddatsiz faol')?.hasAttribute('disabled')).toBe(true);
  });

  it('links to the wallet top-up when funds are short', async () => {
    mocks.purchasePlan.mockRejectedValue(
      new PlanPurchaseError({ kind: 'insufficient', message: "Hamyonda mablag' yetarli emas" }),
    );
    mocks.getWallet.mockResolvedValue({ availableTiyin: 0 });
    await mount(free);
    await click('Tanlash');
    const link = document.body.querySelector('a[href^="/hamyon"]');
    expect(link?.getAttribute('href')).toContain('toldirish=30000');
  });

  it('shows an admin the unlimited banner and disables every card', async () => {
    const staff: MyPlan = { code: 'STAFF', expiresAt: null, entitlements: {} };
    await mount(staff);
    expect(document.body.textContent).toContain('Admin sifatida barcha imkoniyatlar cheklovsiz');
    expect(document.body.textContent).toContain('Hozir: Admin');
    expect(button('Tanlash')).toBeUndefined();
    const ctas = [...document.body.querySelectorAll('article button')];
    expect(ctas).toHaveLength(2);
    expect(ctas.every((b) => b.hasAttribute('disabled'))).toBe(true);
    expect(mocks.purchasePlan).not.toHaveBeenCalled();
  });

  it('shows no unlimited banner to an ordinary user', async () => {
    await mount(free);
    expect(document.body.textContent).not.toContain('barcha imkoniyatlar cheklovsiz');
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

 it('presents one total pool with custom addresses included, at the API price', async () => {
   await mount(null);
   expect(host.textContent).toContain('10 ta jami pochta qutisi');
   expect(host.textContent).toContain('Shundan 2 ta yangi shaxsiy email');
   expect(host.textContent).toContain('3 ta jami pochta qutisi');
 });

 it.each([
   { 'mailbox.slots': '5', 'mailbox.custom_slots': '1' },
   { 'mailbox.total_slots': '-1', 'mailbox.custom_slots': '2' },
   { 'mailbox.total_slots': '10', 'mailbox.custom_slots': '2extra' },
 ] as Record<string, string | null>[])('keeps a legacy or malformed paid catalogue unavailable: %j', async entitlements => {
   await act(async () => root.render(createElement(PlansView, {
     catalog: [catalog[0], { ...catalog[1], entitlements }], mine: free, signedIn: true,
   })));
   const card = host.querySelector('article[aria-label="Pro tarifi"]')!;
   expect(card.textContent).toContain('Pochta limiti aniqlanmadi');
   expect(card.textContent).not.toContain('0 ta jami pochta qutisi');
   const purchase = card.querySelector<HTMLButtonElement>('button')!;
   expect(purchase.disabled).toBe(true);
   await act(async () => purchase.click());
   expect(mocks.purchasePlan).not.toHaveBeenCalled();
 });

 it('derives FAQ capacity from admin-edited catalogue values', async () => {
   await act(async () => root.render(createElement(PlansView, {
     catalog: [
       { ...catalog[0], entitlements: { 'mailbox.total_slots': '4', 'mailbox.custom_slots': '0' } },
       { ...catalog[1], entitlements: { 'mailbox.total_slots': '12', 'mailbox.custom_slots': '1' } },
     ], mine: free, signedIn: true,
   })));
   const faq = host.querySelector('details')!;
   expect(faq.textContent).toContain('Free’da jami 4 ta');
   expect(faq.textContent).toContain('Pro’da jami 12 ta');
   expect(faq.textContent).toContain('1 tagacha yangi shaxsiy email');
   expect(faq.textContent).not.toContain('jami 10');
 });
 it('blocks a stale price confirmation after the catalogue loses unified capacity', async () => {
   mocks.purchasePlan.mockRejectedValueOnce(new PlanPurchaseError({ kind: 'price_changed', currentPriceTiyin: 3_100_000 }));
   await mount(free);
   await click('Tanlash');
   expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
   await act(async () => root.render(createElement(PlansView, {
     catalog: [catalog[0], { ...catalog[1], entitlements: { 'mailbox.slots': '5', 'mailbox.custom_slots': '1' } }],
     mine: free, signedIn: true,
   })));
   await clickInDialog('Tanlash');
   expect(mocks.purchasePlan).toHaveBeenCalledTimes(1);
 });
