// @vitest-environment jsdom
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/plans-admin', async () => {
  const actual = await vi.importActual<typeof import('@/lib/plans-admin')>('@/lib/plans-admin');
  return { ...actual, updatePlanEntitlements: mocks.update };
});

import type { PlanEntitlementRow } from '@/lib/plans-admin';
import { AdminPlanMailboxes } from './admin-plan-mailboxes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const row = (planCode: PlanEntitlementRow['planCode'], key: string, value: string | null): PlanEntitlementRow => ({
  planCode, key, value, updatedBy: null, updatedAt: '2026-10-01T00:00:00Z',
});
const ROWS = [
  row('STANDARD', 'mailbox.total_slots', '3'), row('STANDARD', 'mailbox.custom_slots', '0'),
  row('PRO', 'mailbox.total_slots', '10'), row('PRO', 'mailbox.custom_slots', '2'),
  row('MAX', 'mailbox.total_slots', '10'), row('MAX', 'mailbox.custom_slots', '3'),
];

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.update.mockReset().mockResolvedValue(ROWS);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(createElement(AdminPlanMailboxes, { initial: ROWS })));
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const byLabel = (l: string) => host.querySelector<HTMLInputElement>(`[aria-label="${l}"]`)!;
const submit = async () => {
  const btn = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Slotlarni saqlash')!;
  await act(async () => { btn.click(); });
};

describe('AdminPlanMailboxes', () => {
  it('sends null when Cheksiz is ticked', async () => {
    act(() => { byLabel('Pro jami qutilar cheksiz').click(); });
    await submit();
    expect(mocks.update).toHaveBeenCalledTimes(1);
    const items = mocks.update.mock.calls[0][0] as { planCode: string; key: string; value: string | null }[];
    expect(items.find((i) => i.planCode === 'PRO' && i.key === 'mailbox.total_slots')?.value).toBeNull();
    expect(items.some((i) => i.planCode === 'MAX')).toBe(false);
  });

  it('asks before a reduction and saves only after confirming', async () => {
    const input = byLabel('Pro jami qutilar');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '2');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await submit();
    expect(mocks.update).not.toHaveBeenCalled();
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Jami limitdan ortiq qutilar qulflanishi mumkin. Faol savdo va limitdan tashqari qutilar himoyalangan. Davom etasizmi?');
    const ok = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Davom etish')!;
    await act(async () => { ok.click(); });
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it('restores the last finite value when Cheksiz is unticked', () => {
    const box = byLabel('Pro jami qutilar cheksiz');
    act(() => { box.click(); });
    expect(byLabel('Pro jami qutilar').value).toBe('');
    act(() => { box.click(); });
    expect(byLabel('Pro jami qutilar').value).toBe('10');
  });

  it('falls back to 0 when the saved value was already unlimited', () => {
    act(() => root.render(createElement(AdminPlanMailboxes, {
      key: 'unlimited',
      initial: ROWS.map((r) => (r.planCode === 'PRO' && r.key === 'mailbox.total_slots' ? { ...r, value: null } : r)),
    })));
    act(() => { byLabel('Pro jami qutilar cheksiz').click(); });
    expect(byLabel('Pro jami qutilar').value).toBe('0');
  });
});

 it('reads and saves only the total key while ignoring the historical random limit', async () => {
   act(() => root.render(createElement(AdminPlanMailboxes, { key: 'legacy', initial: [...ROWS, row('PRO', 'mailbox.slots', '5')] })));
   expect(byLabel('Pro jami qutilar').value).toBe('10');
   await submit();
   expect(mocks.update.mock.calls[0][0]).toContainEqual({ planCode: 'PRO', key: 'mailbox.total_slots', value: '10' });
   expect(mocks.update.mock.calls[0][0].some((item: { key: string }) => item.key === 'mailbox.slots')).toBe(false);
 });

 it('a custom-only reduction changes new creation without warning of existing inbox locks', async () => {
   const input = byLabel('Pro shaxsiy qutilar');
   await act(async () => {
     Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '0');
     input.dispatchEvent(new Event('input', { bubbles: true }));
   });
   await submit();
   const dialog = document.querySelector('[role="dialog"]')!;
   expect(dialog.textContent).toContain('Yangi nomli quti olish chegarasi kamayadi');
   expect(dialog.textContent).toContain('Mavjud qutilarni o‘qish umumiy limit bo‘yicha saqlanadi');
   expect(dialog.textContent).not.toContain('qulflanadi');
   const ok = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Davom etish')!;
   await act(async () => ok.click());
   expect(mocks.update.mock.calls[0][0]).toContainEqual({ planCode: 'PRO', key: 'mailbox.custom_slots', value: '0' });
 });
