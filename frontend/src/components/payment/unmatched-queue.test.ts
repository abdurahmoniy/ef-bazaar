// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UnmatchedQueue } from './unmatched-queue';
import type { ObservationResponse } from '@/lib/payment-types';

const clientMocks = vi.hoisted(() => ({
  listUnmatched: vi.fn(),
  resolveObservation: vi.fn(),
  ignoreObservation: vi.fn(),
}));

/**
 * `PaymentAdminError` is real, not mocked: the queue tells a 409 apart with
 * `instanceof`, and a stubbed class would make that check pass vacuously.
 */
vi.mock('@/lib/payment-admin-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/payment-admin-client')>(
    '@/lib/payment-admin-client',
  );
  return { ...clientMocks, PaymentAdminError: actual.PaymentAdminError };
});

const { PaymentAdminError } = await import('@/lib/payment-admin-client');

const USER_ID = '3f1a7c2e-9b04-4d5f-8a61-0c2e5d7b9f13';

function observation(id: string, amountTiyin = 25_000_000): ObservationResponse {
  return {
    id,
    cardLast4: '4417',
    amountTiyin,
    observedAt: '2026-08-13T09:30:00Z',
    rawText: `Humo: popolnenie 250 000.00 UZS; karta *4417; balans 1 250 000.00`,
    status: 'UNMATCHED',
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  Object.values(clientMocks).forEach((mock) => mock.mockReset());
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function render(initialItems: ObservationResponse[]) {
  await act(async () => root.render(createElement(UnmatchedQueue, { initialItems })));
}

function rows() {
  return [...container.querySelectorAll('article')];
}

function button(text: string) {
  return [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find((b) => b.textContent?.trim() === text);
}

async function click(text: string) {
  await act(async () => button(text)!.click());
}

async function type(selector: string, value: string) {
  const el = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  const proto = el.tagName === 'TEXTAREA'
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function openResolveForm() {
  await click('Foydalanuvchiga biriktirish');
}

describe('UnmatchedQueue', () => {
  it('says so when there is nothing waiting', async () => {
    await render([]);
    expect(container.textContent).toContain("Tekshirilmagan tushum yo'q");
  });

  it('shows the amount, the card tail and the arrival time', async () => {
    await render([observation('a')]);
    const text = rows()[0].textContent ?? '';
    expect(text).toContain("250 000 so'm");
    expect(text).toContain('4417');
    // Tashkent is UTC+5.
    expect(text).toContain('14:30');
  });

  it('keeps the raw Telegram message collapsed behind a disclosure', async () => {
    await render([observation('a')]);
    const details = container.querySelector('details')!;
    expect(details.open).toBe(false);
    expect(details.querySelector('pre')?.textContent).toContain('popolnenie');
  });

  // --- the irreversible action -------------------------------------------

  it('will not submit an attribution until the id is a real UUID', async () => {
    await render([observation('a')]);
    await openResolveForm();
    await type('input[id^="resolve-user-"]', '3f1a7c2e-9b04');
    await type('textarea[id^="resolve-note-"]', 'Telegramda tasdiqladi');

    expect(button('Davom etish')!.disabled).toBe(true);
    expect(container.textContent).toContain("noto'g'ri");
  });

  it('will not submit an attribution without a note', async () => {
    await render([observation('a')]);
    await openResolveForm();
    await type('input[id^="resolve-user-"]', USER_ID);
    expect(button('Davom etish')!.disabled).toBe(true);

    await type('textarea[id^="resolve-note-"]', '   ');
    expect(button('Davom etish')!.disabled).toBe(true);
    expect(container.textContent).toContain('Izoh majburiy');
  });

  /**
   * The confirm step exists because the posting cannot be reversed. It must
   * show the id, not only the amount — the id is the half that can be wrong
   * while still looking right.
   */
  it('confirms with the amount AND the target id before anything is sent', async () => {
    await render([observation('a')]);
    await openResolveForm();
    await type('input[id^="resolve-user-"]', USER_ID);
    await type('textarea[id^="resolve-note-"]', 'Telegramda tasdiqladi');
    await click('Davom etish');

    expect(clientMocks.resolveObservation).not.toHaveBeenCalled();
    const text = container.textContent ?? '';
    expect(text).toContain("250 000 so'm");
    expect(text).toContain(USER_ID);
    expect(text).toContain('Telegramda tasdiqladi');
    expect(text).toContain("ortga qaytarib bo'lmaydi");
  });

  it('lets the admin back out of the confirm step without sending', async () => {
    await render([observation('a')]);
    await openResolveForm();
    await type('input[id^="resolve-user-"]', USER_ID);
    await type('textarea[id^="resolve-note-"]', 'izoh');
    await click('Davom etish');
    await click('Orqaga');

    expect(clientMocks.resolveObservation).not.toHaveBeenCalled();
    expect(button('Davom etish')).toBeDefined();
  });

  it('posts the normalized id and the trimmed note, then drops the row', async () => {
    clientMocks.resolveObservation.mockResolvedValue({});
    await render([observation('a')]);
    await openResolveForm();
    await type('input[id^="resolve-user-"]', `  ${USER_ID.toUpperCase()}  `);
    await type('textarea[id^="resolve-note-"]', '  Telegramda tasdiqladi  ');
    await click('Davom etish');
    await click('Tasdiqlayman, biriktirilsin');

    expect(clientMocks.resolveObservation)
      .toHaveBeenCalledWith('a', USER_ID, 'Telegramda tasdiqladi');
    expect(rows().length).toBe(0);
    expect(container.textContent).toContain("Tekshirilmagan tushum yo'q");
  });

  // --- dismissing ---------------------------------------------------------

  it('dismisses with no note at all — the asymmetry is deliberate', async () => {
    clientMocks.ignoreObservation.mockResolvedValue({});
    await render([observation('a')]);
    await click("E'tiborsiz qoldirish");
    // The submit inside the opened form carries the same label.
    await act(async () => {
      container.querySelector<HTMLFormElement>('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(clientMocks.ignoreObservation).toHaveBeenCalledWith('a', undefined);
    expect(rows().length).toBe(0);
  });

  it('passes a trimmed dismissal note when one is given', async () => {
    clientMocks.ignoreObservation.mockResolvedValue({});
    await render([observation('a')]);
    await click("E'tiborsiz qoldirish");
    await type('textarea[id^="ignore-note-"]', '  test to’lov  ');
    await act(async () => {
      container.querySelector<HTMLFormElement>('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(clientMocks.ignoreObservation).toHaveBeenCalledWith('a', 'test to’lov');
  });

  // --- failures -----------------------------------------------------------

  it("surfaces the server's message when an attribution is refused", async () => {
    clientMocks.resolveObservation.mockRejectedValue(
      new PaymentAdminError(400, 'Izoh majburiy'),
    );
    await render([observation('a')]);
    await openResolveForm();
    await type('input[id^="resolve-user-"]', USER_ID);
    await type('textarea[id^="resolve-note-"]', 'izoh');
    await click('Davom etish');
    await click('Tasdiqlayman, biriktirilsin');

    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Izoh majburiy');
    // Nothing was credited, so the row must stay actionable.
    expect(rows().length).toBe(1);
  });

  /**
   * 409 is not a failure: another admin already handled the row, so it is gone
   * from the queue. Showing "Bu tushum allaqachon hal qilingan: ..." would read
   * as an error the admin has to do something about.
   */
  it('treats a 409 as the row already being handled, not as an error', async () => {
    clientMocks.resolveObservation.mockRejectedValue(
      new PaymentAdminError(409, 'Bu tushum allaqachon hal qilingan: MANUALLY_RESOLVED'),
    );
    clientMocks.listUnmatched.mockResolvedValue([observation('b', 5_000_000)]);
    await render([observation('a'), observation('b', 5_000_000)]);
    await openResolveForm();
    await type('input[id^="resolve-user-"]', USER_ID);
    await type('textarea[id^="resolve-note-"]', 'izoh');
    await click('Davom etish');
    await click('Tasdiqlayman, biriktirilsin');

    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(clientMocks.listUnmatched).toHaveBeenCalled();
    expect(rows().length).toBe(1);
    expect(rows()[0].textContent).toContain("50 000 so'm");
  });

  it('still drops a 409 row when the re-read itself fails', async () => {
    clientMocks.ignoreObservation.mockRejectedValue(new PaymentAdminError(409, 'allaqachon'));
    clientMocks.listUnmatched.mockRejectedValue(new Error('tarmoq'));
    await render([observation('a')]);
    await click("E'tiborsiz qoldirish");
    await act(async () => {
      container.querySelector<HTMLFormElement>('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(rows().length).toBe(0);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
