// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CustomClaim } from './custom-claim';
import type { Availability } from '@/lib/custom-mailbox';
import { MailboxApiError } from '@/lib/custom-mailbox-client';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  checkAvailability: vi.fn(),
  claimCustomMailbox: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: vi.fn() }) }));
vi.mock('@/lib/custom-mailbox-client', async () => ({
  ...await vi.importActual<typeof import('@/lib/custom-mailbox-client')>('@/lib/custom-mailbox-client'),
  checkAvailability: mocks.checkAvailability,
  claimCustomMailbox: mocks.claimCustomMailbox,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const free = (email: string, over: Partial<Availability> = {}): Availability => ({
  email, available: true, reason: null, canClaim: true, claimBlock: null, ...over,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.resetAllMocks();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

async function render(plan: 'STANDARD' | 'PRO' | 'MAX' | 'STAFF' | null) {
  await act(async () => root.render(createElement(CustomClaim, { plan, accountId: null })));
}

async function type(value: string) {
  const input = container.querySelector('input#custom-local') as HTMLInputElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350);
  });
}

const text = () => container.textContent ?? '';
const button = (label: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(label));

describe('CustomClaim', () => {
  it('checks the name after the user stops typing and offers it', async () => {
    mocks.checkAvailability.mockResolvedValue(free('alibek1@efbazaar.uz'));
    await render('PRO');

    await type('AliBek1');

    expect(mocks.checkAvailability).toHaveBeenCalledTimes(1);
    expect(mocks.checkAvailability.mock.calls[0].slice(0, 2)).toEqual(['alibek1', 'efbazaar.uz']);
    expect(text()).toContain('Olishingiz mumkin');
    expect(button('Olish')).toBeTruthy();
  });

  it('shows a projection-not-ready response and succeeds after an explicit retry', async () => {
    const message = 'Tarif huquqlari yangilanmoqda. Birozdan keyin qayta urinib ko‘ring.';
    mocks.checkAvailability
      .mockRejectedValueOnce(new MailboxApiError(503, 'plan_projection_unavailable', message))
      .mockResolvedValueOnce(free('alibek1@efbazaar.uz'));
    await render('PRO');
    await type('alibek1');

    expect(container.querySelector('[role="status"]')?.textContent).toContain(message);
    expect(text()).not.toContain('Tekshirilmoqda');
    expect(button('Olish')).toBeUndefined();
    expect(container.querySelector('a[href="/plans"]')).toBeNull();
    expect(button('Qayta urinish')).toBeTruthy();
    await act(async () => button('Qayta urinish')!.click());
    expect(text()).toContain('Tekshirilmoqda');
    expect(button('Qayta urinish')).toBeUndefined();
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    expect(mocks.checkAvailability).toHaveBeenCalledTimes(2);
    expect(mocks.checkAvailability.mock.calls[1].slice(0, 2)).toEqual(['alibek1', 'efbazaar.uz']);
    expect(text()).not.toContain(message);
    expect(text()).toContain('Olishingiz mumkin');
    expect(button('Olish')).toBeTruthy();
  });

  it('offers retry on a network failure and clears the error when the name changes', async () => {
    mocks.checkAvailability
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(free('alibek2@efbazaar.uz'));
    await render('PRO');
    await type('alibek1');
    expect(text()).toContain('Manzilni tekshirib bo‘lmadi. Qayta urinib ko‘ring');
    expect(button('Qayta urinish')).toBeTruthy();
    expect(button('Olish')).toBeUndefined();

    await type('alibek2');
    expect(text()).not.toContain('Manzilni tekshirib bo‘lmadi');
    expect(button('Qayta urinish')).toBeUndefined();
    expect(button('Olish')).toBeTruthy();
  });

  it('ignores a failed request for an abandoned name', async () => {
    let rejectOld!: (error: Error) => void;
    mocks.checkAvailability
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectOld = reject; }))
      .mockResolvedValueOnce(free('alibek2@efbazaar.uz'));
    await render('PRO');
    await type('alibek1');
    await type('alibek2');
    await act(async () => rejectOld(new MailboxApiError(503, 'plan_projection_unavailable', 'Eski so‘rov xatosi')));
    expect(text()).not.toContain('Eski so‘rov xatosi');
    expect(button('Qayta urinish')).toBeUndefined();
    expect(button('Olish')).toBeTruthy();
  });

  it('claims and goes on to linking', async () => {
    mocks.checkAvailability.mockResolvedValue(free('alibek1@efbazaar.uz'));
    mocks.claimCustomMailbox.mockResolvedValue({ id: 'box-1', email: 'alibek1@efbazaar.uz' });
    await render('PRO');
    await type('alibek1');

    await act(async () => button('Olish')!.click());

    expect(mocks.claimCustomMailbox).toHaveBeenCalledWith('alibek1', 'efbazaar.uz', expect.any(AbortSignal));
    expect(mocks.push).toHaveBeenCalledWith('/mailboxes/custom/box-1/link');
  });

  it('explains a bad name without asking the server', async () => {
    await render('PRO');
    await type('ali');

    expect(mocks.checkAvailability).not.toHaveBeenCalled();
    expect(text()).toContain('5–24 belgi, faqat lotin harf va raqam');
  });

  it('does not advertise retired MAX for efootball.uz', async () => {
    mocks.checkAvailability.mockResolvedValue(free('alibek1@efbazaar.uz'));
    await render('PRO');
    await type('alibek1');

    expect(text()).not.toContain('alibek1@efootball.uz ni ham olishingiz mumkin');
    expect(container.querySelector('a[href="/plans"]')).toBeNull();
    expect(container.querySelector('[role="radiogroup"]')).not.toBeNull();
  });

  it('keeps historical MAX without advertising unsupported new premium addresses', async () => {
    mocks.checkAvailability.mockResolvedValue(free('alibek1@efbazaar.uz'));
    await render('MAX');
    await type('alibek1');
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
    expect(container.querySelector('a[href="/plans"]')).toBeNull();
  });

  it('sends Free to the plans page instead of claiming', async () => {
    mocks.checkAvailability.mockResolvedValue(free('alibek1@efbazaar.uz', { canClaim: false, claimBlock: 'NO_SLOT' }));
    await render('STANDARD');
    await type('alibek1');

    const upgrade = Array.from(container.querySelectorAll('a')).find((a) => a.textContent?.includes('Pro tarifini ko‘rish'));
    expect(upgrade?.getAttribute('href')).toBe('/plans');
    expect(button('Olish')).toBeUndefined();
  });
});

 it('lets Pro select the premium domain and rechecks there', async () => {
   mocks.checkAvailability.mockResolvedValue(free('alibek1@efbazaar.uz'));
   await render('PRO');
   await type('alibek1');
   const domain = container.querySelector<HTMLButtonElement>('[role="radio"]:last-child');
   expect(domain).not.toBeNull();
   mocks.checkAvailability.mockResolvedValue(free('alibek1@efootball.uz'));
   await act(async () => domain!.click());
   await act(async () => { await vi.advanceTimersByTimeAsync(300); });
   expect(mocks.checkAvailability.mock.calls.at(-1)!.slice(0, 2)).toEqual(['alibek1', 'efootball.uz']);
 });

 it('shows actual shared pool usage beside the custom creation limit', async () => {
   await act(async () => root.render(createElement(CustomClaim, { plan: 'PRO', accountId: null, slots: { used: 10, limit: 10, totalUsed: 10, totalLimit: 10, customUsed: 2, customLimit: 2, full: true, plan: 'PRO', lockedCount: 0 } })));
   expect(text()).toContain('Jami: 10 / 10');
   expect(text()).toContain('shundan custom: 2 / 2');
 });
