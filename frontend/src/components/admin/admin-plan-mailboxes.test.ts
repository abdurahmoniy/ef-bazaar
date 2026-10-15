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
  row('STANDARD', 'mailbox.slots', '3'), row('STANDARD', 'mailbox.custom_slots', '0'),
  row('PRO', 'mailbox.slots', '5'), row('PRO', 'mailbox.custom_slots', '1'),
  row('MAX', 'mailbox.slots', '10'), row('MAX', 'mailbox.custom_slots', '3'),
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
    act(() => { byLabel('Aristokrat tasodifiy qutilar cheksiz').click(); });
    await submit();
    expect(mocks.update).toHaveBeenCalledTimes(1);
    const items = mocks.update.mock.calls[0][0] as { planCode: string; key: string; value: string | null }[];
    expect(items.find((i) => i.planCode === 'MAX' && i.key === 'mailbox.slots')?.value).toBeNull();
    expect(items.find((i) => i.planCode === 'PRO' && i.key === 'mailbox.slots')?.value).toBe('5');
  });

  it('asks before a reduction and saves only after confirming', async () => {
    const input = byLabel('Boyvachcha tasodifiy qutilar');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '2');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await submit();
    expect(mocks.update).not.toHaveBeenCalled();
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Kamaytirsangiz, limitdan ortiq qutilar qulflanadi. Davom etasizmi?');
    const ok = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Davom etish')!;
    await act(async () => { ok.click(); });
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
});
