// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ListingSourceStep } from './listing-source-step';
import type { UserAccountResponse } from '@/lib/accounts-types';

const account = (over: Partial<UserAccountResponse> = {}): UserAccountResponse => ({
  id: 'acc-1', title: 'Asosiy', description: 'tavsif', attributes: {}, mediaMessageIds: [],
  email: null, emailSource: null, status: 'ACTIVE', onMarket: false, currentListingId: null,
  createdAt: '2026-09-18T00:00:00Z', updatedAt: '2026-09-18T00:00:00Z',
  ...over,
});

let container: HTMLDivElement;
let root: Root;
const onNew = vi.fn();
const onPick = vi.fn();

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
});

async function render(accounts: UserAccountResponse[]) {
  await act(async () =>
    root.render(createElement(ListingSourceStep, { accounts, onNew, onPick })),
  );
}

const button = (label: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(label));

describe('ListingSourceStep', () => {
  it('offers both paths when the user has accounts', async () => {
    await render([account(), account({ id: 'acc-2', title: 'Ikkinchi' })]);

    expect(container.textContent).toContain('Asosiy');
    expect(button('Narx belgilash')).toBeDefined();
    expect(container.textContent).toContain('2');
    expect(container.textContent).toContain('Yangi akkount qo‘shish');
    expect(onNew).not.toHaveBeenCalled();
  });

  it('skips straight to the form when there is nothing to pick', async () => {
    await render([]);

    expect(container.textContent).not.toContain('Akkountlarimdan tanlash');
    expect(onNew).toHaveBeenCalled();
  });

  it('hands back the chosen account', async () => {
    const mine = account();
    await render([mine]);

    await act(async () => button('Narx belgilash')!.click());

    expect(onPick).toHaveBeenCalledWith(mine);
  });

  it('does not offer an account that is already on the market', async () => {
    await render([account({ onMarket: true, currentListingId: 'listing-1' })]);

    expect(button('Narx belgilash')).toBeUndefined();
    expect(container.querySelector('a[href="/marketplace/listing-1"]')).not.toBeNull();
    expect(container.textContent).toContain('Bozorda');
    expect(container.textContent).toContain('0 ta mavjud');
  });
  it('counts only active unlisted accounts and excludes archived accounts', async () => {
    await render([account(), account({ id: 'listed', onMarket: true }), account({ id: 'old', title: 'Archived', status: 'ARCHIVED' })]);
    expect(container.textContent).toContain('1 ta mavjud');
    expect(container.textContent).not.toContain('Archived');
  });

});
