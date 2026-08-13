// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AddCardForm } from './add-card-form';

const clientMocks = vi.hoisted(() => ({ createPlatformCard: vi.fn() }));

vi.mock('@/lib/payment-admin-client', () => ({
  createPlatformCard: clientMocks.createPlatformCard,
}));

/** Passes Luhn. The same HUMO test number card-detect.test.ts uses. */
const HUMO_PAN = '9860000000000000';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  clientMocks.createPlatformCard.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function renderForm(onAdded: () => void = () => {}) {
  await act(async () => root.render(createElement(AddCardForm, { onAdded })));
}

function field(id: string) {
  return container.querySelector<HTMLInputElement>(`#${id}`)!;
}

async function type(id: string, value: string) {
  const input = field(id);
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function fillValidCard() {
  await type('platform-card-pan', HUMO_PAN);
  await type('platform-card-holder', 'efbazaar mchj');
  await type('platform-card-month', '12');
  await type('platform-card-year', '29');
}

function submitButton() {
  return container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
}

async function submit() {
  await act(async () => {
    container.querySelector<HTMLFormElement>('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

describe('AddCardForm', () => {
  it('keeps submit dead until the whole card is valid', async () => {
    await renderForm();
    expect(submitButton().disabled).toBe(true);

    await fillValidCard();
    expect(submitButton().disabled).toBe(false);
  });

  it('groups the number as it is typed', async () => {
    await renderForm();
    await type('platform-card-pan', HUMO_PAN);
    expect(field('platform-card-pan').value).toBe('9860 0000 0000 0000');
  });

  it('upper-cases the holder as it is typed, matching what the backend stores', async () => {
    await renderForm();
    await type('platform-card-holder', 'efbazaar mchj');
    expect(field('platform-card-holder').value).toBe('EFBAZAAR MCHJ');
  });

  it('names the detected brand under the number', async () => {
    await renderForm();
    await type('platform-card-pan', HUMO_PAN);
    expect(container.textContent).toContain('HUMO');
  });

  it('sends digits, an upper-cased holder and a four-digit year', async () => {
    clientMocks.createPlatformCard.mockResolvedValue({});
    const onAdded = vi.fn();
    await renderForm(onAdded);
    await fillValidCard();
    await submit();

    expect(clientMocks.createPlatformCard).toHaveBeenCalledWith({
      pan: HUMO_PAN,
      holderName: 'EFBAZAAR MCHJ',
      expiryMonth: 12,
      expiryYear: 2029,
    });
    expect(onAdded).toHaveBeenCalled();
  });

  /** The full number must not linger in component state after it is sent. */
  it('clears the number once the card is created', async () => {
    clientMocks.createPlatformCard.mockResolvedValue({});
    await renderForm();
    await fillValidCard();
    await submit();

    expect(field('platform-card-pan').value).toBe('');
    expect(field('platform-card-holder').value).toBe('');
  });

  it('refuses to send a BIN no brand claims, rather than round-tripping to a 400', async () => {
    await renderForm();
    await type('platform-card-pan', '6011000000000004');
    await type('platform-card-holder', 'EFBAZAAR MCHJ');
    await type('platform-card-month', '12');
    await type('platform-card-year', '29');

    expect(submitButton().disabled).toBe(true);
    await submit();
    expect(clientMocks.createPlatformCard).not.toHaveBeenCalled();
  });

  it('flags an expiry the backend would refuse without a round trip', async () => {
    await renderForm();
    await fillValidCard();
    await type('platform-card-month', '13');

    expect(container.textContent).toContain("Oy 1 dan 12 gacha bo'lishi kerak");
    expect(submitButton().disabled).toBe(true);
  });

  it("surfaces the backend's own message when the card is refused", async () => {
    clientMocks.createPlatformCard.mockRejectedValue(
      new Error("Oxirgi 4 raqami bir xil faol karta allaqachon bor: 0000"),
    );
    await renderForm();
    await fillValidCard();
    await submit();

    expect(container.querySelector('[role="alert"]')?.textContent)
      .toBe("Oxirgi 4 raqami bir xil faol karta allaqachon bor: 0000");
  });

  it('never puts the number in a message on screen', async () => {
    clientMocks.createPlatformCard.mockRejectedValue(new Error('Karta raqami xato'));
    await renderForm();
    await type('platform-card-pan', '9860 0000 0000 000');
    expect(container.textContent).not.toContain('9860');

    await fillValidCard();
    await submit();
    const alert = container.querySelector('[role="alert"]')?.textContent ?? '';
    expect(alert).not.toContain('9860');
  });
});
