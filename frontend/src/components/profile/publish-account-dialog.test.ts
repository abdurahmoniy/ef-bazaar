// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PublishAccountDialog } from './publish-account-dialog';
import type { UserAccountResponse } from '@/lib/accounts-types';

const mocks = vi.hoisted(() => ({ publishAccount: vi.fn(), push: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: vi.fn() }) }));
vi.mock('@/lib/accounts-client', () => ({ publishAccount: mocks.publishAccount }));

const account: UserAccountResponse = {
  id: 'acc-1', title: 'Asosiy', description: 'tavsif', attributes: {}, mediaMessageIds: ['msg-1'],
  email: null, emailSource: null, status: 'ACTIVE', onMarket: false, currentListingId: null,
  createdAt: '2026-09-18T00:00:00Z', updatedAt: '2026-09-18T00:00:00Z',
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function render(layout: 'dialog' | 'page' = 'dialog') {
  await act(async () =>
    root.render(createElement(PublishAccountDialog, { account, onClose: vi.fn(), layout })),
  );
}

async function typePrice(value: string) {
  const input = container.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const submit = () =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes("Sotuvga qo'yish"))!;

describe('PublishAccountDialog', () => {
  it('blocks publishing an existing account without images', async () => {
    mocks.publishAccount.mockResolvedValue({ ok: true, data: { id: 'listing-1' } });
    await act(async () => root.render(createElement(PublishAccountDialog, { account: { ...account, mediaMessageIds: [] }, onClose: vi.fn() })));
    await typePrice('250000');
    await act(async () => submit().click());
    expect(mocks.publishAccount).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Kamida 1 ta rasm');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/profile/accounts/acc-1');
  });

  it('keeps labels scoped when multiple pricing forms stay mounted', async () => {
    await act(async () => root.render(createElement('div', null,
      createElement('div', { hidden: true }, createElement(PublishAccountDialog, { account, layout: 'page', onClose: vi.fn() })),
      createElement(PublishAccountDialog, { account: { ...account, id: 'second' }, layout: 'page', onClose: vi.fn() }),
    )));
    const forms = container.querySelectorAll('form');
    const ids = Array.from(container.querySelectorAll('[id]')).map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const form of forms) {
      for (const label of form.querySelectorAll('label[for]')) {
        const target = document.getElementById(label.getAttribute('for')!);
        expect(form.contains(target)).toBe(true);
      }
    }
  });
  it('sends the selling terms and nothing else', async () => {
    mocks.publishAccount.mockResolvedValue({ ok: true, data: { id: 'listing-1' } });
    await render();
    await typePrice('2400000');

    const select = container.querySelector<HTMLSelectElement>('select')!;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(select, 'EXCHANGE_ONLY');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await act(async () => submit().click());

    expect(mocks.publishAccount).toHaveBeenCalledWith('acc-1', {
      price: 2400000,
      priceNegotiable: false,
      exchangeMode: 'EXCHANGE_ONLY',
      channelIds: [],
    });
    expect(mocks.push).toHaveBeenCalledWith('/marketplace/listing-1?result=published');
  });

  it('refuses a price below the platform minimum without calling the server', async () => {
    await render();
    await typePrice('4000');

    await act(async () => submit().click());

    expect(mocks.publishAccount).not.toHaveBeenCalled();
    expect(container.textContent).toContain('5 000');
  });

  it('keeps the dialog open and shows the server message on failure', async () => {
    mocks.publishAccount.mockResolvedValue({
      ok: false, status: 400, message: "Akkountga rasm qo'shing", code: 'account_without_photos',
    });
    await render();
    await typePrice('2400000');

    await act(async () => submit().click());

    expect(container.textContent).toContain("Akkountga rasm qo'shing");
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it('supports inline pricing without modal semantics and still publishes', async () => {
    mocks.publishAccount.mockResolvedValue({ ok: true, data: { id: 'listing-2' } });
    await render('page');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).toContain('Asosiy');
    await typePrice('125000');
    await act(async () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    expect(mocks.publishAccount).toHaveBeenCalledWith('acc-1', expect.objectContaining({ price: 125000 }));
    expect(mocks.push).toHaveBeenCalledWith('/marketplace/listing-2?result=published');
  });

});
