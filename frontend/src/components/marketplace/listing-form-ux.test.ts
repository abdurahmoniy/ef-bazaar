// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEEDED_LISTING_ATTRIBUTE_DEFINITIONS } from '@/lib/listing-form-data';
import type { ListingResponse } from '@/lib/marketplace-types';
vi.mock('@/app/auth/actions', () => ({ linkTelegramAction: vi.fn() }));
import { ListingForm } from './listing-form';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/hooks/use-telegram-main-button', () => ({ useTelegramMainButton: vi.fn() }));
vi.mock('@/components/marketplace/card-picker', () => ({ CardPicker: () => null }));
vi.mock('@/lib/payment-client', () => ({ getPublicTradeCommissionConfig: () => Promise.resolve(null) }));
let host: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
const attributes = (platform: string) => ({
  platform, highest_division_level: '2', team_strength: '3100', coins: '-120',
  android_coins: '999', ios_coins: '777', has_google_play_link: true, has_game_center_link: true,
  device_transfer_limit: '1',
});
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
  fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify({ id: 'saved-1' }) });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function click(text: string) {
  const button = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.trim() === text);
  expect(button, `Button: ${text}`).toBeDefined();
  await act(async () => button!.click());
}
async function draft(platform: string, step = 'gameplay', price = '250000') {
  localStorage.setItem('efbazaar:listing-draft-v2', JSON.stringify({ step, state: {
    description: 'Account with rare players', price, priceNegotiable: false, attributes: attributes(platform),
  } }));
  await act(async () => root.render(createElement(ListingForm, { attributeDefinitions: SEEDED_LISTING_ATTRIBUTE_DEFINITIONS })));
}
async function submittedAttributes() {
  const blob = fetchMock.mock.calls[0][1].body.get('data') as Blob;
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(blob);
  });
  return JSON.parse(text).attributes;
}

async function upload(files: File[]) {
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}
async function edit(serviceAttributes: Record<string, unknown> = {}) {
  const listing = {
    id: 'listing-1', sellerId: 'seller', description: 'Account with rare players', price: 250000,
    priceNegotiable: false, attributes: { ...attributes('MOBILE'), device_transfer_limit: 6,
      has_google_play_link: undefined, has_game_center_link: undefined, ...serviceAttributes },
    mediaMessageIds: ['photo'], status: 'ACTIVE', likeCount: 0, forwardCount: 0, createdAt: '', updatedAt: '',
  } as ListingResponse;
  await act(async () => root.render(createElement(ListingForm, { initialListing: listing, attributeDefinitions: SEEDED_LISTING_ATTRIBUTE_DEFINITIONS })));
  await click('Davom etish');
  await click('Davom etish');
}

describe('listing form recovery and service switches', () => {
  it('defaults service switches to off and submits their toggled values', async () => {
    await edit();
    const google = host.querySelector<HTMLButtonElement>('#has_google_play_link')!;
    const gameCenter = host.querySelector<HTMLButtonElement>('#has_game_center_link')!;
    expect(google.getAttribute('role')).toBe('switch');
    expect(gameCenter.getAttribute('role')).toBe('switch');
    expect(google.getAttribute('aria-checked')).toBe('false');
    expect(gameCenter.getAttribute('aria-checked')).toBe('false');
    await act(async () => google.click());
    expect(google.getAttribute('aria-checked')).toBe('true');
    await act(async () => google.click());
    expect(google.getAttribute('aria-checked')).toBe('false');
    await act(async () => gameCenter.click());
    expect(gameCenter.getAttribute('aria-checked')).toBe('true');
    await click('Davom etish');
    expect(host.textContent).toContain('Sof summa');
    await click('Davom etish');
    expect(host.textContent).toContain('Google Play ulanmagan');
    expect(host.textContent).toContain('Game Center ulangan');
    await click('Saqlash');
    expect(await submittedAttributes()).toMatchObject({ has_google_play_link: false, has_game_center_link: true });
  });
  it('preserves explicit false and true values on existing listings and guards double submission', async () => {
    await edit({ has_google_play_link: false, has_game_center_link: true });
    expect(host.querySelector('#has_google_play_link')?.getAttribute('aria-checked')).toBe('false');
    expect(host.querySelector('#has_game_center_link')?.getAttribute('aria-checked')).toBe('true');
    await click('Davom etish');
    await click('Davom etish');
    const save = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Saqlash')!;
    await act(async () => { save.click(); save.click(); });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(await submittedAttributes()).toMatchObject({ has_google_play_link: false, has_game_center_link: true });
  });
  it('restores a later draft at photos and retains text and price', async () => {
    await draft('STEAM', 'review', '125000');
    expect(host.querySelector('input[type="file"]')).not.toBeNull();
    expect(host.textContent).toContain('Rasmlar saqlanmaydi');
    expect(host.textContent).toContain('Tavsif va narx saqlandi');
    await upload([new File(['ok'], 'ok.jpg', { type: 'image/jpeg' })]);
    await click('Davom etish');
    expect(host.querySelector<HTMLTextAreaElement>('#description')?.value).toBe('Account with rare players');
    await click('Davom etish');
    await click('Davom etish');
    expect(host.querySelector<HTMLInputElement>('#price')?.value).toBe('125000');
  });
  it('shows format and size limits before picking and keeps the valid subset with rejection reasons', async () => {
    await act(async () => root.render(createElement(ListingForm, { attributeDefinitions: [] })));
    for (const text of ['JPG', 'PNG', 'WEBP', 'HEIC', 'HEIF', '8 MB', '10 ta']) expect(host.textContent).toContain(text);
    const large = new File(['large'], 'large.png', { type: 'image/png' });
    Object.defineProperty(large, 'size', { value: 8 * 1024 * 1024 + 1 });
    await upload([new File(['ok'], 'ok.jpg', { type: 'image/jpeg' }), new File(['bad'], 'bad.gif', { type: 'image/gif' }), large]);
    expect(host.querySelectorAll('img[alt^="Yuklangan rasm"]')).toHaveLength(1);
    expect(host.textContent).toContain('bad.gif: format');
    expect(host.textContent).toContain('large.png: 8 MB');
    await upload([new File(['ok'], 'fixed.heic', { type: 'image/heic' })]);
    expect(host.textContent).not.toContain('bad.gif:');
    expect(host.textContent).not.toContain('large.png:');
    expect(host.querySelectorAll('img[alt^="Yuklangan rasm"]')).toHaveLength(2);
  });
  it('reports overflow while retaining the first ten valid photos', async () => {
    await act(async () => root.render(createElement(ListingForm, { attributeDefinitions: [] })));
    await upload(Array.from({ length: 11 }, (_, i) => new File(['ok'], `photo${i}.jpg`, { type: 'image/jpeg' })));
    expect(host.querySelectorAll('img[alt^="Yuklangan rasm"]')).toHaveLength(10);
    expect(host.textContent).toContain('photo10.jpg: ko‘pi bilan 10 ta');
  });
});

describe('listing form final review safeguards', () => {
  it('shows unknown service status without claiming an unanswered service is clean', async () => {
    const listing: ListingResponse = { id: 'old', sellerId: 'seller', status: 'ACTIVE', forwardCount: 0, likeCount: 0, createdAt: '', updatedAt: '', description: 'Account with rare players', price: 250000, priceNegotiable: false, attributes: { platform: 'MOBILE' }, mediaMessageIds: ['photo'] };
    await act(async () => root.render(createElement(ListingForm, { initialListing: listing, attributeDefinitions: [] })));
    for (let i = 0; i < 4; i++) await click('Davom etish');
    expect(host.textContent).toContain('Google Play holati noma’lum');
    expect(host.textContent).toContain('Game Center holati noma’lum');
    expect(host.textContent).not.toContain('toza');
    expect(host.textContent).not.toContain('100%');
  });
  it('restores old draft switches as off and allows continuing', async () => {
    localStorage.setItem('efbazaar:listing-draft-v2', JSON.stringify({ step: 'review', state: {
      description: 'Account with rare players', price: '250000', priceNegotiable: false,
      attributes: { ...attributes('MOBILE'), device_transfer_limit: '6', has_google_play_link: false, has_game_center_link: false },
    } }));
    await act(async () => root.render(createElement(ListingForm, { attributeDefinitions: SEEDED_LISTING_ATTRIBUTE_DEFINITIONS })));
    await upload([new File(['ok'], 'ok.jpg', { type: 'image/jpeg' })]);
    await click('Davom etish'); await click('Davom etish'); await click('Davom etish');
    expect(host.querySelector('#price')).not.toBeNull();
    await click('Davom etish');
    expect(host.textContent).toContain('Google Play ulanmagan');
    expect(host.textContent).toContain('Game Center ulanmagan');
  });
  it('returns final submission to the first failing step and clears the error after correction', async () => {
    let resolveDefinitions!: (value: unknown) => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { resolveDefinitions = resolve; }));
    localStorage.setItem('efbazaar:listing-draft-v3', JSON.stringify({ step: 'photos', state: {
      description: 'Account with rare players', price: '250000', priceNegotiable: false, attributes: attributes('STEAM'),
    } }));
    await act(async () => root.render(createElement(ListingForm)));
    await upload([new File(['ok'], 'ok.jpg', { type: 'image/jpeg' })]);
    for (let i = 0; i < 4; i++) await click('Davom etish');
    await act(async () => resolveDefinitions({ ok: true, json: async () => [
      ...SEEDED_LISTING_ATTRIBUTE_DEFINITIONS,
      { key: 'account_region', labelUz: 'Region', type: 'STRING', required: true, constraints: {} },
    ] }));
    await click("E'lon yaratish");
    expect(host.textContent).toContain("Region maydonini to'ldiring.");
    expect(host.querySelector('#price')).toBeNull();
    const input = Array.from(host.querySelectorAll('label')).find(label => label.textContent === 'Region')?.parentElement?.querySelector('input')!;
    expect(input).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Asia');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(host.textContent).not.toContain("Region maydonini to'ldiring.");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
