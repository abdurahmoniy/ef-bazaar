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
const mobileLabels = ['Android Coin', 'iOS Coin', 'Google Play', 'Game Center', 'Transfer limiti'];
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
async function draft(platform: string, step = 'gameplay') {
  localStorage.setItem('efbazaar:listing-draft-v2', JSON.stringify({ step, state: {
    description: 'Account with rare players', price: '250000', priceNegotiable: false, attributes: attributes(platform),
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

describe('platform-specific listing wizard', () => {
  it.each(['STEAM', 'PLAYSTATION'])('does not ask %s sellers for mobile fields or block on stale transfer limit', async (platform) => {
    await draft(platform);
    for (const label of mobileLabels) expect(host.textContent).not.toContain(label);
    expect(host.querySelector('input[aria-label="Coin balansi"]')).not.toBeNull();
    expect(host.textContent).toContain('Team Strength');
    expect(host.textContent).toContain('Eng yuqori division');
    await click('Davom etish');
    expect(host.querySelector('#price')).not.toBeNull();
  });
  it('keeps mobile fields and removes irrelevant values when switching platforms', async () => {
    await draft('MOBILE');
    for (const label of mobileLabels) expect(host.textContent).toContain(label);
    expect(host.querySelector('input[aria-label="Coin balansi"]')).toBeNull();
    await click('Steam');
    for (const label of mobileLabels) expect(host.textContent).not.toContain(label);
    const stored = JSON.parse(localStorage.getItem('efbazaar:listing-draft-v2')!).state.attributes;
    expect(stored).not.toHaveProperty('android_coins');
    expect(stored).not.toHaveProperty('device_transfer_limit');
    expect(stored.team_strength).toBe('3100');
    await click('Mobile');
    expect(host.querySelector('input[aria-label="Coin balansi"]')).toBeNull();
    expect(JSON.parse(localStorage.getItem('efbazaar:listing-draft-v2')!).state.attributes).not.toHaveProperty('coins');
    await click('Davom etish');
    expect(host.textContent).toContain('limiti');
    expect(host.querySelector('#price')).toBeNull();
  });
  it('creates a Steam listing without sending Mobile attributes', async () => {
    await draft('STEAM', 'photos');
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['photo'], 'photo.png', { type: 'image/png' })] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    await click('Davom etish');
    await click('Davom etish');
    await click('Davom etish');
    await click('Davom etish');
    await click("E'lon yaratish");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(await submittedAttributes()).toEqual({ platform: 'STEAM', highest_division_level: '2', team_strength: 3100, coins: -120 });
  });
  it.each(['STEAM', 'PLAYSTATION'])('omits stale Mobile data when saving an edited %s listing', async (platform) => {
    const listing: ListingResponse = {
      id: 'listing-1', sellerId: 'seller', description: 'Account with rare players', price: 250000,
      priceNegotiable: false, attributes: attributes(platform), mediaMessageIds: ['photo'], status: 'ACTIVE',
      likeCount: 0, forwardCount: 0, createdAt: '', updatedAt: '',
    };
    await act(async () => root.render(createElement(ListingForm, {
      initialListing: listing, attributeDefinitions: SEEDED_LISTING_ATTRIBUTE_DEFINITIONS,
    })));
    await click('Davom etish');
    await click('Davom etish');
    await click('Davom etish');
    await click('Davom etish');
    for (const label of ['Google Play', 'Game Center', 'Transfer']) expect(host.textContent).not.toContain(label);
    expect(host.textContent).toContain('Coin balansi');
    expect(host.textContent).toContain('-120');
    await click('Saqlash');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT');
    expect(await submittedAttributes()).toEqual({ platform, highest_division_level: '2', team_strength: 3100, coins: -120 });
  });
});
