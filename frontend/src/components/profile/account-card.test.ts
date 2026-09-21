// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountCard } from './account-card';
import type { UserAccountResponse } from '@/lib/accounts-types';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  deleteAccount: vi.fn(),
  unpublishAccount: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }));
vi.mock('@/lib/accounts-client', () => ({
  deleteAccount: mocks.deleteAccount,
  unpublishAccount: mocks.unpublishAccount,
}));

const account = (over: Partial<UserAccountResponse> = {}): UserAccountResponse => ({
  id: 'acc-1',
  title: 'Asosiy akkount',
  description: 'tavsif',
  attributes: { platform: 'MOBILE', highest_division_level: 3, team_strength: 3150 },
  mediaMessageIds: [],
  email: 'a7f2@efbazaar.uz',
  emailSource: 'PLATFORM',
  status: 'ACTIVE',
  onMarket: false,
  currentListingId: null,
  createdAt: '2026-09-18T00:00:00Z',
  updatedAt: '2026-09-18T00:00:00Z',
  ...over,
});

let container: HTMLDivElement;
let root: Root;

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

async function render(over: Partial<UserAccountResponse> = {}) {
  await act(async () => root.render(createElement(AccountCard, { account: account(over) })));
}

const button = (label: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(label));

describe('AccountCard', () => {
  it('keeps the email masked until it is revealed', async () => {
    await render();
    expect(container.textContent).not.toContain('a7f2@efbazaar.uz');

    await act(async () => button("Ko'rsatish")!.click());

    expect(container.textContent).toContain('a7f2@efbazaar.uz');
  });

  it('shows the Bozorda badge and hides delete while published', async () => {
    await render({ onMarket: true, currentListingId: 'listing-1' });

    expect(container.textContent).toContain('Bozorda');
    expect(button("O'chirish")).toBeUndefined();
    expect(button('Bozordan olish')).toBeDefined();
  });

  it('offers publishing when the account is idle', async () => {
    await render();
    expect(button('Bozorga chiqarish')).toBeDefined();
    expect(button('Bozordan olish')).toBeUndefined();
  });

  it('summarises the account attributes', async () => {
    await render();
    expect(container.textContent).toContain('Mobile');
    expect(container.textContent).toContain('D3');
    expect(container.textContent).toContain('3150');
  });

  it('says so when no email is attached', async () => {
    await render({ email: null, emailSource: null });
    expect(container.textContent).toContain('Email biriktirilmagan');
    expect(button("Ko'rsatish")).toBeUndefined();
  });
});
