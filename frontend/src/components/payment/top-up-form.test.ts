// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TopUpForm } from './top-up-form';
import type { InvoiceResponse } from '@/lib/payment-types';

const clientMocks = vi.hoisted(() => ({ createInvoice: vi.fn() }));

vi.mock('@/lib/payment-client', () => ({
  createInvoice: clientMocks.createInvoice,
}));

/** Explicit escape — never assert a literal invisible character. See money.test.ts. */
const NBSP = '\u00A0';

const invoice: InvoiceResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  pan: '9860123456789012',
  holderName: 'EFBAZAAR MCHJ',
  cardExpiry: '12/29',
  requestedTiyin: 5_000_000,
  transferTiyin: 5_000_000,
  expiresAt: '2026-08-13T09:15:00Z',
  status: 'PENDING',
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  clientMocks.createInvoice.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function renderForm(onCreated: (created: InvoiceResponse) => void = () => {}) {
  await act(async () => root.render(createElement(TopUpForm, { onCreated })));
}

function amountInput() {
  return container.querySelector<HTMLInputElement>('#top-up-amount')!;
}

async function type(value: string) {
  const input = amountInput();
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('TopUpForm', () => {
  it('offers the presets with grouped amounts', async () => {
    await renderForm();
    const labels = [...container.querySelectorAll('button[type="button"]')]
      .map((button) => button.textContent);
    expect(labels).toEqual([
      `50${NBSP}000`,
      `100${NBSP}000`,
      `200${NBSP}000`,
      `500${NBSP}000`,
    ]);
  });

  it("sends whole so'm to the backend when a preset is tapped", async () => {
    clientMocks.createInvoice.mockResolvedValue(invoice);
    const onCreated = vi.fn();
    await renderForm(onCreated);

    await act(async () => {
      container.querySelectorAll<HTMLButtonElement>('button[type="button"]')[0].click();
    });

    expect(clientMocks.createInvoice).toHaveBeenCalledWith(50_000);
    expect(onCreated).toHaveBeenCalledWith(invoice);
  });

  it('groups the custom amount as it is typed', async () => {
    await renderForm();
    await type('100000');
    expect(amountInput().value).toBe(`100${NBSP}000`);
  });

  it('rejects an amount below the minimum without a round trip', async () => {
    await renderForm();
    await type('999');
    await act(async () => {
      container.querySelector<HTMLFormElement>('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(clientMocks.createInvoice).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent)
      .toBe(`Eng kam summa: 1${NBSP}000 so'm.`);
  });

  it("surfaces the backend's own message when the invoice is refused", async () => {
    clientMocks.createInvoice.mockRejectedValue(new Error('Faol so‘rov mavjud'));
    await renderForm();

    await act(async () => {
      container.querySelectorAll<HTMLButtonElement>('button[type="button"]')[0].click();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Faol so‘rov mavjud');
  });
});
