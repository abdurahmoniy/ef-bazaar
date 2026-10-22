// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProfileAccounts } from './profile-accounts';
import type { UserAccountResponse } from '@/lib/accounts-types';

vi.mock('./publish-account-dialog', () => ({ PublishAccountDialog: ({ account }: { account: UserAccountResponse }) => createElement('div', { role: 'dialog' }, account.title) }));
vi.mock('./account-card', () => ({
  AccountCard: ({ account, pinned, onTogglePin }: { account: UserAccountResponse; pinned: boolean; onTogglePin: () => void }) =>
    createElement('article', { 'data-id': account.id }, account.title, createElement('button', { onClick: onTogglePin }, pinned ? 'Unpin' : 'Pin')),
}));
const accounts = Array.from({ length: 6 }, (_, index) => ({
  mediaMessageIds: ['msg-1'], email: null, emailSource: null, emailVerified: false, currentListingId: null, createdAt: '', updatedAt: '',
  description: 'Akkount tavsifi', attributes: { platform: 'MOBILE', highest_division_level: 3, team_strength: 3150, device_transfer_limit: 5 },
  id: `acc-${index}`, title: `Team ${index}`, status: 'ACTIVE', onMarket: index < 2,
})) as UserAccountResponse[];
let desktop = true;
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  desktop = true;
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('min-width') && desktop, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  localStorage.clear(); sessionStorage.clear();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render(viewerId = 'viewer', rows = accounts) {
  await act(async () => root.render(createElement(ProfileAccounts, { key: viewerId, viewerId, accounts: rows })));
}
const button = (text: string) => Array.from(container.querySelectorAll('button')).find((node) => node.textContent?.startsWith(text))!;
it('shows controls only for a larger collection and preserves filters when returning', async () => {
  await render('viewer', accounts.slice(0, 1));
  expect(container.querySelector('input')).toBeNull();
  expect(container.querySelector('[aria-label="Akkount holati"]')).toBeNull();
  await render();
  await act(async () => button('Bozorda emas').click());
  expect(container.querySelectorAll('article')).toHaveLength(4);
  await act(async () => root.unmount()); root = createRoot(container);
  await render();
  expect(container.querySelectorAll('article')).toHaveLength(4);
});
it('pins to the top, restores pins and isolates preferences between users', async () => {
  await render();
  await act(async () => container.querySelector<HTMLButtonElement>('[data-id="acc-4"] button')!.click());
  expect(container.querySelector('article')?.getAttribute('data-id')).toBe('acc-4');
  await render('other');
  expect(container.querySelector('article')?.getAttribute('data-id')).toBe('acc-0');
  await render();
  expect(container.querySelector('article')?.getAttribute('data-id')).toBe('acc-4');
});
it('recovers from a search with no matches without hiding the controls', async () => {
  sessionStorage.setItem('accounts-view:viewer', JSON.stringify({ query: 'missing', filter: 'all' }));
  await render();
  expect(container.querySelectorAll('article')).toHaveLength(0);
  expect(container.textContent).toContain('Akkount topilmadi');
  await act(async () => button('Tozalash').click());
  expect(container.querySelectorAll('article')).toHaveLength(6);
});

it('reveals and focuses a saved account despite restored filters, retaining its private name', async () => {
  sessionStorage.setItem('accounts-view:viewer', JSON.stringify({ query: 'missing', filter: 'market' }));
  await act(async () => root.render(createElement(ProfileAccounts, { viewerId: 'viewer', accounts, savedAccountId: 'acc-4' })));
  expect(container.querySelectorAll('article')).toHaveLength(6);
  expect(document.activeElement?.contains(container.querySelector('[data-id="acc-4"]')!)).toBe(true);
  expect(container.textContent).toContain('Akkount saqlandi');
  expect(container.textContent).toContain('Hali bozorga chiqarilmagan');
  expect(container.textContent).toContain('Team 4');
  await act(async () => button('Bozorga chiqarish').click());
  expect(container.querySelector('[role="dialog"]')?.textContent).toBe('Team 4');
});
it('does not claim a missing or another owner’s account was saved', async () => {
  await act(async () => root.render(createElement(ProfileAccounts, { viewerId: 'viewer', accounts, savedAccountId: 'unknown' })));
  expect(container.textContent).not.toContain('Akkount saqlandi');
});

it('offers editing instead of publishing an incomplete saved account', async () => {
  await act(async () => root.render(createElement(ProfileAccounts, { viewerId: 'viewer', accounts: [{ ...accounts[4], attributes: {} }], savedAccountId: 'acc-4' })));
  expect(button('Bozorga chiqarish')).toBeUndefined();
  expect(container.querySelector('a[href="/profile/accounts/acc-4"]')?.textContent).toBe('Ma’lumotlarni to‘ldirish');
  expect(container.querySelector('[role="dialog"]')).toBeNull();
});
it('collects sold accounts under their own filter and keeps them out of the idle ones', async () => {
  const rows = [...accounts, { ...accounts[5], id: 'sold', title: 'Eski', status: 'ARCHIVED', archivedReason: 'SOLD_ELSEWHERE', onMarket: false }];
  await render('viewer', rows as typeof accounts);
  await act(async () => button('Sotilgan').click());
  expect(container.querySelectorAll('article')).toHaveLength(1);
  expect(container.textContent).toContain('Eski');
  await act(async () => button('Bozorda emas').click());
  expect(container.textContent).not.toContain('Eski');
});

it('offers real seller bulk management from the account collection',async()=>{await render();expect(container.querySelector('a[href="/seller-tools"]')?.textContent).toContain('Sotuvchi vositalari');});

it('shows working compact mobile status filters even for two accounts', async () => {
  desktop = false;
  const rows = [accounts[0], { ...accounts[1], id: 'sold', status: 'ARCHIVED', onMarket: false, archivedReason: 'SOLD_ON_PLATFORM' }] as UserAccountResponse[];
  await render('viewer', rows);
  expect(container.querySelector('[aria-label="Akkount holati"]')).not.toBeNull();
  expect(button('Barchasi').textContent).toContain('2');
  expect(button('Sotilgan').textContent).toContain('1');
  await act(async () => button('Sotilgan').click());
  expect(container.querySelectorAll('article')).toHaveLength(1);
  expect(container.querySelector('article')?.getAttribute('data-id')).toBe('sold');
  await act(async () => button('Bozorda').click());
  expect(container.querySelector('article')?.getAttribute('data-id')).toBe('acc-0');
});

it('keeps the mobile search behind a labelled control until requested', async () => {
  desktop = false;
  await render();
  expect(container.querySelector('input')).toBeNull();
  const search = container.querySelector<HTMLButtonElement>('[aria-label="Akkount qidirish"]')!;
  expect(search).not.toBeNull();
  await act(async () => search.click());
  expect(container.querySelector('input')).not.toBeNull();
  expect(document.activeElement).toBe(container.querySelector('input'));
});

it('offers the mobile archive filter with a zero count and a recoverable empty state', async () => {
  desktop = false;
  await render('viewer', accounts.slice(0,1));
  expect(button('Sotilgan').textContent).toContain('0');
  await act(async () => button('Sotilgan').click());
  expect(container.querySelectorAll('article')).toHaveLength(0);
  expect(container.textContent).toContain('Akkount topilmadi');
  await act(async () => button('Tozalash').click());
  expect(container.querySelectorAll('article')).toHaveLength(1);
});

it('retains the selected idle filter when returning from desktop to mobile', async () => {
  desktop = false;
  sessionStorage.setItem('accounts-view:viewer', JSON.stringify({ query: '', filter: 'unlisted' }));
  await render();
  expect(button('Bozorda emas').getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelectorAll('article')).toHaveLength(4);
  await act(async () => button('Barchasi').click());
  expect(container.querySelectorAll('article')).toHaveLength(6);
  expect(button('Bozorda emas')).toBeUndefined();
});
