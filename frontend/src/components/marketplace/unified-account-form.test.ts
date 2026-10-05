// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { UserAccountResponse } from '@/lib/accounts-types';

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), create: vi.fn(), update: vi.fn(), media: vi.fn(), publish: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock('@/app/auth/actions', () => ({ linkTelegramAction: vi.fn() }));
vi.mock('@/components/marketplace/card-picker', () => ({ CardPicker: () => null }));
vi.mock('@/lib/payment-client', () => ({ getPublicTradeCommissionConfig: () => Promise.resolve(null) }));
vi.mock('@/lib/accounts-client', () => ({ createAccount: mocks.create, updateAccount: mocks.update, replaceAccountMedia: mocks.media, publishAccount: mocks.publish }));
import { AccountForm } from './account-form';
import { NewListingEntry } from './new-listing-entry';

const saved: UserAccountResponse = {
  id: 'saved-account', title: 'Asosiy', description: 'Test uchun yetarli tavsif', attributes: { platform: 'MOBILE', highest_division_level: 3, team_strength: 3150, device_transfer_limit: 5 }, mediaMessageIds: [],
  email: null, emailSource: null, status: 'ACTIVE', onMarket: false, currentListingId: null, createdAt: '', updatedAt: '',
};
let host: HTMLDivElement;
let root: Root;
let time: number;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks(); localStorage.clear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  URL.createObjectURL = vi.fn(() => 'blob:test'); URL.revokeObjectURL = vi.fn();
  time = Date.now(); vi.spyOn(Date, 'now').mockImplementation(() => time);
  mocks.create.mockResolvedValue({ ok: true, data: saved });
  mocks.update.mockResolvedValue({ ok: true, data: saved });
  mocks.media.mockResolvedValue({ ok: true, data: { ...saved, mediaMessageIds: ['photo-1'] } });
  mocks.publish.mockResolvedValue({ ok: true, data: { id: 'listing-1' } });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const button = (label: string) => Array.from(host.querySelectorAll('button')).find((node) => !node.closest('[hidden]') && node.textContent?.trim() === label);
async function click(label: string) { time += 1000; expect(button(label), label).toBeDefined(); await act(async () => button(label)!.click()); }
async function fill(selector: string, value: string) {
  const input = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function renderEntry(entry: 'profile' | 'marketplace') {
  await act(async () => root.render(entry === 'profile'
    ? createElement(AccountForm, { attributeDefinitions: [] })
    : createElement(NewListingEntry, { accounts: [], attributeDefinitions: [], botUsername: '' })));
}
async function uploadPhoto() {
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: [new File(['image'], 'squad.png', { type: 'image/png' })] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}
async function review(entry: 'profile' | 'marketplace') {
  await renderEntry(entry);
  await uploadPhoto();
  await click('Davom etish');
  expect(host.querySelector('#account-title')).not.toBeNull();
  await fill('#account-title', 'Asosiy'); await fill('#description', saved.description!);
  await click('Davom etish'); await click('Davom etish');
  expect(button('Saqlash')).toBeDefined(); expect(button("Sotuvga qo'yish")).toBeDefined();
}
it.each(['profile', 'marketplace'] as const)('%s uses the common private save action and preserves the name', async (entry) => {
  await review(entry); await click('Saqlash');
  expect(mocks.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ title: 'Asosiy' }));
  expect(mocks.publish).not.toHaveBeenCalled(); expect(mocks.push).toHaveBeenCalledWith('/profile?tab=accounts&saved=saved-account');
});
it.each(['profile', 'marketplace'] as const)('%s saves one account before asking for sale terms', async (entry) => {
  await review(entry); await click("Sotuvga qo'yish");
  expect(mocks.create).toHaveBeenCalledOnce(); expect(mocks.publish).not.toHaveBeenCalled();
  expect(host.querySelector('input[inputmode="numeric"]')?.closest('[hidden]')).toBeNull();
  await fill('input[inputmode="numeric"]', '125000'); await click("Sotuvga qo'yish");
  expect(mocks.publish).toHaveBeenCalledWith('saved-account', expect.objectContaining({ price: 125000 }));
  expect(mocks.push).toHaveBeenCalledWith('/marketplace/listing-1?result=published');
});
it.each(['profile', 'marketplace'] as const)('%s blocks the photo step until an image is selected', async (entry) => {
  await renderEntry(entry);
  await click('Davom etish');
  expect(host.textContent).toContain('Kamida 1 ta rasm');
  expect(host.querySelector('#account-title')).toBeNull();
  expect(host.textContent).not.toContain('Saqlash uchun rasm ixtiyoriy');
  expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.publish).not.toHaveBeenCalled();
  await uploadPhoto();
  await click('Davom etish');
  expect(host.querySelector('#account-title')).not.toBeNull();
});
it('allows existing account photos to satisfy the photo requirement', async () => {
  await act(async () => root.render(createElement(AccountForm, { account: { ...saved, mediaMessageIds: ['photo-1'] }, attributeDefinitions: [] })));
  await click('Davom etish');
  expect(host.querySelector('#account-title')).not.toBeNull();
});
it('reuses the saved account when a photo upload fails and is retried', async () => {
  mocks.media.mockResolvedValueOnce({ ok: false, message: 'Upload failed' });
  await review('profile'); await click('Saqlash');
  expect(host.textContent).toContain('rasmlar yuklanmadi');
  await click('Saqlash');
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.update).toHaveBeenCalledWith('saved-account', expect.objectContaining({ title: 'Asosiy' }));
  expect(mocks.media).toHaveBeenCalledTimes(2);
});
it('returns from pricing to the preserved editor and saves without creating a duplicate', async () => {
  await review('profile'); await click("Sotuvga qo'yish"); await click('Orqaga');
  expect(button('Saqlash')).toBeDefined(); await click('Saqlash');
  expect(mocks.create).toHaveBeenCalledOnce(); expect(mocks.update).toHaveBeenCalledOnce();
  expect(mocks.publish).not.toHaveBeenCalled();
});

it('shows saved photos after clearing the local selection on return from pricing', async () => {
  await review('profile'); await click("Sotuvga qo'yish"); await click('Orqaga');
  await click('Orqaga'); await click('Orqaga'); await click('Orqaga');
  await click('Tozalash');
  expect(host.querySelector('img[alt="Joriy rasm 1"]')).not.toBeNull();
  expect(host.textContent).toContain('Joriy rasmlar (1 ta)');
});

it('restores account draft fields without the restored-draft notice', async () => {
  localStorage.setItem('efbazaar:account-draft-v1', JSON.stringify({ state: { title: 'My draft', description: 'Saved description', attributes: {} } }));
  await act(async () => root.render(createElement(AccountForm, { attributeDefinitions: [] })));
  expect(host.textContent).not.toContain('ma’lumotlari tiklandi');
  expect(host.textContent).not.toContain('Rasmlar saqlanmaydi');
  await uploadPhoto();
  await click('Davom etish');
  expect(host.querySelector<HTMLInputElement>('#account-title')?.value).toBe('My draft');
});
