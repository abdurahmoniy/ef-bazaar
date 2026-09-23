// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { UserAccountResponse } from '@/lib/accounts-types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/marketplace/listing-form', () => ({
  ListingForm: ({ onBack }: { onBack?: () => void }) => {
    const [value, setValue] = useState('');
    return createElement('div', { 'data-wizard': true },
      createElement('input', { 'aria-label': 'Draft', value, onChange: (event: React.ChangeEvent<HTMLInputElement>) => setValue(event.target.value) }),
      createElement('button', { onClick: onBack }, 'Return from wizard'));
  },
}));
import { NewListingEntry } from './new-listing-entry';
const account: UserAccountResponse = { id: 'acc', title: 'Asosiy', description: '', attributes: {}, mediaMessageIds: [], email: null, emailSource: null, status: 'ACTIVE', onMarket: false, currentListingId: null, createdAt: '', updatedAt: '' };
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
async function render(accounts = [account]) { await act(async () => root.render(createElement(NewListingEntry, { accounts, attributeDefinitions: [], botUsername: '' }))); }
async function click(label: string) {
  const button = Array.from(host.querySelectorAll('button')).find(b => !b.closest('[hidden]') && b.textContent?.trim() === label);
  expect(button).toBeDefined(); await act(async () => button!.click());
}
it('selects an account directly and returns from inline pricing', async () => {
  await render();
  expect(host.querySelector('h1')?.textContent).toBe('Qaysi akkountni sotasiz?');
  await click('Narx belgilash');
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(host.querySelector('input[inputmode="numeric"]')?.closest('[hidden]')).toBeNull();
  expect(host.querySelector('h1')?.textContent).toBe('Narx va sotuv shartlari');
  await click('Orqaga');
  expect(host.querySelector('h1')?.textContent).toBe('Qaysi akkountni sotasiz?');
});
it('preserves the mounted new-account form when returning to selection', async () => {
  await render(); await click('Yangi akkount qo‘shishRasmlar va ma’lumotlarni kiriting');
  const input = host.querySelector<HTMLInputElement>('input[aria-label="Draft"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'saved draft'); input.dispatchEvent(new Event('input',{bubbles:true})); });
  await click('Return from wizard');
  expect(host.querySelector('h1')?.textContent).toBe('Qaysi akkountni sotasiz?');
  await click('Yangi akkount qo‘shishRasmlar va ma’lumotlarni kiriting');
  expect(host.querySelector<HTMLInputElement>('input[aria-label="Draft"]')?.value).toBe('saved draft');
});
it('starts the wizard directly without active accounts', async () => {
  await render([{ ...account, status: 'ARCHIVED' }]);
  expect(host.querySelector('[data-wizard]')).not.toBeNull();
  expect(host.querySelector('[data-wizard]')?.closest('[hidden]')).toBeNull();
  expect(host.querySelector('h1')?.textContent).toBe('Yangi akkount');
});
