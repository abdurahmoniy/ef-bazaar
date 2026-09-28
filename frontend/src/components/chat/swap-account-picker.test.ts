// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SWAP_OTHER, SwapAccountPicker } from './swap-account-picker';
import type { UserAccountResponse } from '@/lib/accounts-types';

vi.mock('@/lib/accounts-client', () => ({ getMyAccounts: vi.fn() }));
vi.mock('@/lib/swap-accounts', async (orig) => ({ ...(await orig<object>()), fetchBusyAccountIds: vi.fn() }));
import { getMyAccounts } from '@/lib/accounts-client';
import { fetchBusyAccountIds } from '@/lib/swap-accounts';

let root: Root;
let container: HTMLDivElement;
let picked: string | null;

function account(id: string, title: string | null, extra: Partial<UserAccountResponse> = {}): UserAccountResponse {
  return { id, title, description: 'Kuchli akkount\nbatafsil', attributes: {}, mediaMessageIds: ['m-' + id], email: null,
    emailSource: null, status: 'ACTIVE', onMarket: false, currentListingId: null, createdAt: '', updatedAt: '', ...extra };
}

function Harness() {
  const [value, setValue] = useState<string | null>(null);
  picked = value;
  return createElement(SwapAccountPicker, { value, onChange: setValue });
}

const radios = () => Array.from(container.querySelectorAll<HTMLButtonElement>('[role="radio"]'));

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });

it('lists own accounts with title and Other, nothing preselected', async () => {
  vi.mocked(getMyAccounts).mockResolvedValue({ ok: true, data: [account('a', 'Asosiy akk'), account('b', null)] } as never);
  vi.mocked(fetchBusyAccountIds).mockResolvedValue(new Set());
  await act(async () => root.render(createElement(Harness)));

  expect(radios().map(r => r.textContent)).toEqual([
    expect.stringContaining('Asosiy akk'), expect.stringContaining('Kuchli akkount'), expect.stringContaining('Boshqa'),
  ]);
  expect(radios().every(r => r.getAttribute('aria-checked') === 'false')).toBe(true);
  expect(container.querySelector('img')?.getAttribute('src')).toContain('m-a');
});

it('picks an account or Other', async () => {
  vi.mocked(getMyAccounts).mockResolvedValue({ ok: true, data: [account('a', 'Asosiy akk')] } as never);
  vi.mocked(fetchBusyAccountIds).mockResolvedValue(new Set());
  await act(async () => root.render(createElement(Harness)));

  await act(async () => radios()[0].click());
  expect(picked).toBe('a');
  await act(async () => radios()[1].click());
  expect(picked).toBe(SWAP_OTHER);
});

it('disables accounts busy in another trade', async () => {
  vi.mocked(getMyAccounts).mockResolvedValue({ ok: true, data: [account('a', 'Asosiy akk')] } as never);
  vi.mocked(fetchBusyAccountIds).mockResolvedValue(new Set(['a']));
  await act(async () => root.render(createElement(Harness)));

  expect(radios()[0].disabled).toBe(true);
  expect(radios()[0].textContent).toContain('Savdoda');
});

it('hides archived accounts', async () => {
  vi.mocked(getMyAccounts).mockResolvedValue({ ok: true, data: [account('a', 'Eski', { status: 'ARCHIVED' })] } as never);
  vi.mocked(fetchBusyAccountIds).mockResolvedValue(new Set());
  await act(async () => root.render(createElement(Harness)));

  expect(radios()).toHaveLength(1);
});

it('with no accounts, Other is selected and a link to add one is shown', async () => {
  vi.mocked(getMyAccounts).mockResolvedValue({ ok: true, data: [] } as never);
  vi.mocked(fetchBusyAccountIds).mockResolvedValue(new Set());
  await act(async () => root.render(createElement(Harness)));

  expect(picked).toBe(SWAP_OTHER);
  expect(container.textContent).toContain('Profilga akkount qo‘shish');
});
