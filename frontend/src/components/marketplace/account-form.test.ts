// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountForm } from './account-form';
import { stepsFor } from '@/lib/listing-form-steps';
import type { UserAccountResponse } from '@/lib/accounts-types';

// Formaning o'zi bu testda kerak emas va u server-only zanjirni tortadi.
vi.mock('@/components/marketplace/listing-form', () => ({ ListingForm: () => null }));

const account = (over: Partial<UserAccountResponse> = {}): UserAccountResponse => ({
  id: 'acc-1', title: 'Asosiy', description: 'tavsif', attributes: {}, mediaMessageIds: [],
  email: null, emailSource: null, status: 'ACTIVE', onMarket: false, currentListingId: null,
  createdAt: '2026-09-18T00:00:00Z', updatedAt: '2026-09-18T00:00:00Z',
  ...over,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
});

describe('account form', () => {
  it('drops the pricing step — price belongs to the listing', () => {
    expect(stepsFor('account')).not.toContain('pricing');
    expect(stepsFor('listing')).toContain('pricing');
  });

  it('keeps every other step identical to the listing wizard', () => {
    expect(stepsFor('account')).toEqual(stepsFor('listing').filter((step) => step !== 'pricing'));
  });

  it('warns that edits reach the live listing while the account is on the market', async () => {
    await act(async () =>
      root.render(createElement(AccountForm, { account: account({ onMarket: true }) })),
    );
    expect(container.textContent).toContain("e'longa ham tushadi");
  });

  it('stays quiet when the account is not published', async () => {
    await act(async () => root.render(createElement(AccountForm, { account: account() })));
    expect(container.textContent).not.toContain("e'longa ham tushadi");
  });
});
