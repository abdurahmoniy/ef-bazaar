// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListingChannelPosts } from './listing-channel-posts';
import { listPostedChannels, orderChannelPosts, searchChannels, type ChannelCard } from '@/lib/partner-channels';
import { getWallet } from '@/lib/payment-client';

const { push, native } = vi.hoisted(() => ({
  push: vi.fn(),
  native: { onClick: vi.fn(), offClick: vi.fn(), show: vi.fn(), hide: vi.fn(), setText: vi.fn(), disable: vi.fn(), enable: vi.fn(), showProgress: vi.fn(), hideProgress: vi.fn() },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/telegram', () => ({ getTelegramWebApp: () => ({ MainButton: native }) }));
vi.mock('@/lib/partner-channels', async original => ({ ...await original<typeof import('@/lib/partner-channels')>(), searchChannels: vi.fn(), listPostedChannels: vi.fn(), orderChannelPosts: vi.fn() }));
vi.mock('@/lib/payment-client', () => ({ getWallet: vi.fn() }));
vi.mock('./channel-picker', () => ({ ChannelPicker: ({ selected, onChange, disabled }: { selected: ChannelCard[]; onChange: (value: ChannelCard[]) => void; disabled?: boolean }) => createElement('div', { 'data-selected': selected.map(c => c.channelId).join(',') }, createElement('button', { disabled, onClick: () => onChange([channelA, channelB]) }, 'Ikkala kanalni tanlash')) }));
const channelA: ChannelCard = { channelId: 'channel-a', title: 'Birinchi kanal', username: null, photoFileId: null, subscriberCount: 1000, priceSom: 10000 };
const channelB: ChannelCard = { ...channelA, channelId: 'channel-b', title: 'Ikkinchi kanal', priceSom: 15000 };
const wallet = (availableTiyin = 5000000) => ({ availableTiyin, heldTiyin: 0, withdrawPendingTiyin: 0, lifetimeDepositedTiyin: 0, lifetimeEarnedTiyin: 0 });
let root: Root; let container: HTMLDivElement;
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  vi.mocked(searchChannels).mockResolvedValue([channelA, channelB]); vi.mocked(getWallet).mockResolvedValue(wallet());
  vi.mocked(listPostedChannels).mockResolvedValue([]); vi.mocked(orderChannelPosts).mockResolvedValue();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const render = (initialChannelIds: string[] = ['channel-a']) => act(async () => root.render(createElement('div', { 'data-marketplace-shell': true }, createElement(ListingChannelPosts, { listingId: 'listing-one', initialChannelIds }))));
const button = (label: string) => Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes(label));
const click = async (label: string) => { const target = button(label); expect(target, label).toBeDefined(); await act(async () => target!.click()); };
const review = () => click('Tanlovni ko‘rib chiqish');
const confirm = () => click('buyurtma berish');

describe('ListingChannelPosts purchase journey', () => {
  it('opens valid saved selections directly in live review without placing an order', async () => {
    vi.mocked(searchChannels).mockResolvedValue([{ ...channelA, priceSom: 23000 }, channelB]);
    let resolveWallet!: (value: ReturnType<typeof wallet>) => void;
    vi.mocked(getWallet).mockImplementationOnce(() => new Promise(resolve => { resolveWallet = resolve; }));
    await render(['channel-a', 'channel-a', 'channel-b']);
    expect(container.textContent).not.toContain('Buyurtmani tekshiring');
    expect(orderChannelPosts).not.toHaveBeenCalled();
    await act(async () => resolveWallet(wallet(5000000)));
    expect(container.textContent).toContain('Buyurtmani tekshiring');
    expect(container.querySelector('[data-selected]')).toBeNull();
    expect(container.textContent).toContain('23 000 so‘m');
    expect(button('buyurtma berish')?.textContent).toContain('38 000 so‘m');
    expect(container.textContent).toContain('50 000 so‘m');
    expect(searchChannels).toHaveBeenCalledOnce();
    expect(orderChannelPosts).not.toHaveBeenCalled();
  });
  it('keeps incomplete saved selections in the picker with a warning before review', async () => {
    await render(['channel-a', 'channel-a', 'gone']);
    expect(container.querySelector('[data-selected]')?.getAttribute('data-selected')).toBe('channel-a');
    expect(container.textContent).not.toContain('Buyurtmani tekshiring');
    expect(container.textContent).toContain('endi mavjud emas'); expect(orderChannelPosts).not.toHaveBeenCalled();
    await review(); expect(container.textContent).toContain('Buyurtmani tekshiring'); expect(orderChannelPosts).not.toHaveBeenCalled();
    expect(container.textContent).toContain('10'); expect(container.textContent).toContain('Hamyonda');
    await confirm(); expect(orderChannelPosts).toHaveBeenCalledWith('listing-one', ['channel-a']);
    expect(container.textContent).toContain('Buyurtma qabul qilindi'); expect(container.textContent).not.toContain('tez orada chiqadi');
  });
  it('measures its sole mobile action bar and clears the reservation in review', async () => {
    const original = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute('data-advertising-summary') ? { ...original.call(this), height: 96 } : original.call(this);
    });
    await render([]);
    expect(button('Tanlovni ko‘rib chiqish')?.disabled).toBe(true);
    await click('Ikkala kanalni tanlash');
    const shell = container.querySelector<HTMLElement>('[data-marketplace-shell]')!;
    const bar = container.querySelector('[data-advertising-summary]');
    expect(bar).not.toBeNull(); expect(shell.style.getPropertyValue('--marketplace-bottom-bar-height')).toBe('96px');
    expect(bar?.querySelector('[style]')?.getAttribute('style')).toContain('--app-content-safe-left');
    expect(bar?.querySelector('[style]')?.getAttribute('style')).toContain('--app-content-safe-right');
    expect(bar?.querySelector('[style]')?.getAttribute('style')).toContain('--app-content-safe-bottom');
    await review(); expect(container.querySelector('[data-advertising-summary]')).toBeNull();
    expect(searchChannels).toHaveBeenCalledTimes(2); expect(orderChannelPosts).not.toHaveBeenCalled();
    expect(shell.style.getPropertyValue('--marketplace-bottom-bar-height')).toBe('');
    vi.restoreAllMocks();
  });
  it('requires another explicit confirmation when the live price changes', async () => {
    await render();
    vi.mocked(searchChannels).mockResolvedValue([{ ...channelA, priceSom: 20000 }, channelB]);
    await confirm(); expect(orderChannelPosts).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Narx o‘zgardi');
    expect(button('buyurtma berish')?.textContent).toContain('20');
    await confirm(); expect(orderChannelPosts).toHaveBeenCalledTimes(1);
  });
  it('returns unavailable channels to selection without submitting a partial order', async () => {
    await render(['channel-a', 'channel-b']);
    vi.mocked(searchChannels).mockResolvedValue([channelB]);
    await confirm(); expect(orderChannelPosts).not.toHaveBeenCalled();
    expect(container.querySelector('[data-selected]')?.getAttribute('data-selected')).toBe('channel-b');
    expect(container.textContent).toContain('endi mavjud emas');
  });
  it('preserves selected IDs in a wallet top-up return without including prices', async () => {
    vi.mocked(getWallet).mockResolvedValue(wallet(300000));
    await render(['channel-a', 'channel-b']);
    const topup = container.querySelector<HTMLAnchorElement>('a[href^="/hamyon?"]'); expect(topup).not.toBeNull();
    const url = new URL(topup!.href); expect(url.searchParams.get('toldirish')).toBe('22000');
    expect(url.searchParams.get('keyin')).toBe('/marketplace/listing-one/advertise?channel=channel-a&channel=channel-b');
    expect(orderChannelPosts).not.toHaveBeenCalled();
  });
  it('rechecks a changed wallet balance before ordering and asks for the actual shortfall', async () => {
    await render();
    vi.mocked(getWallet).mockResolvedValue(wallet(200000));
    await confirm(); expect(orderChannelPosts).not.toHaveBeenCalled();
    const topup = container.querySelector<HTMLAnchorElement>('a[href^="/hamyon?"]');
    expect(new URL(topup!.href).searchParams.get('toldirish')).toBe('8000');
    expect(native.setText).toHaveBeenLastCalledWith('Hamyonni to‘ldirish');
  });
  it('allows a free order even if wallet loading fails', async () => {
    vi.mocked(searchChannels).mockResolvedValue([{ ...channelA, priceSom: 0 }]); vi.mocked(getWallet).mockRejectedValue(new Error('Hamyon yuklanmadi'));
    await render(); await click('Bepul joylashni tasdiqlash');
    expect(orderChannelPosts).toHaveBeenCalledWith('listing-one', ['channel-a']);
  });
  it('shows fractional paid prices in both confirmation actions and the wallet', async () => {
    vi.mocked(searchChannels).mockResolvedValue([{ ...channelA, priceSom: 0.4 }]);
    vi.mocked(getWallet).mockResolvedValue(wallet(40));
    await render();
    expect(button('buyurtma berish')?.textContent).toMatch(/0[.,]4\s*so/);
    expect(native.setText.mock.lastCall?.[0]).toMatch(/0[.,]4\s*so/);
    expect(container.textContent?.match(/0[.,]4\s*so/g)).toHaveLength(4);
    await confirm(); expect(orderChannelPosts).toHaveBeenCalledOnce();
  });
  it.each([
    { prices: [0.1, 0.2], tiyin: 30, total: /0[.,]3\s*so/ },
    { prices: [0.07], tiyin: 7, total: /0[.,]07\s*so/ },
  ])('accepts an exact $tiyin tiyin balance without a false top-up shortfall', async ({ prices, tiyin, total }) => {
    const channels = prices.map((priceSom, index) => ({ ...[channelA, channelB][index], priceSom }));
    vi.mocked(searchChannels).mockResolvedValue(channels);
    vi.mocked(getWallet).mockResolvedValue(wallet(tiyin));
    const ids = channels.map(channel => channel.channelId);
    await render(ids);
    expect(container.querySelector('a[href^="/hamyon?"]')).toBeNull();
    expect(button('buyurtma berish')?.textContent).toMatch(total);
    await confirm(); expect(orderChannelPosts).toHaveBeenCalledWith('listing-one', ids);
  });
  it('blocks paid orders when wallet verification fails and offers a read retry', async () => {
    vi.mocked(getWallet).mockRejectedValue(new Error('Hamyon yuklanmadi'));
    await render();
    expect(button('buyurtma berish')?.disabled).toBe(true);
    vi.mocked(getWallet).mockResolvedValue(wallet()); await click('Hamyonni qayta tekshirish');
    expect(button('buyurtma berish')?.disabled).toBe(false); expect(orderChannelPosts).not.toHaveBeenCalled();
  });
  it('locks both native and in-page actions synchronously against duplicate taps', async () => {
    await render();
    let resolve!: () => void; vi.mocked(orderChannelPosts).mockImplementation(() => new Promise<void>(done => { resolve = done; }));
    const nativeClick = native.onClick.mock.calls[0][0] as () => void;
    await act(async () => { nativeClick(); nativeClick(); button('buyurtma berish')?.click(); });
    expect(orderChannelPosts).toHaveBeenCalledTimes(1); expect(native.onClick).toHaveBeenCalledTimes(1);
    expect(button('Ikkala kanalni tanlash')).toBeUndefined();
    await act(async () => resolve());
  });
  it('does not race a manual status refresh with the native purchase action', async () => {
    await render();
    let resolveWallet!: (value: ReturnType<typeof wallet>) => void;
    vi.mocked(getWallet).mockImplementationOnce(() => new Promise(resolve => { resolveWallet = resolve; }));
    const nativeClick = native.onClick.mock.calls[0][0] as () => void;
    await act(async () => { button('Yangilash')!.click(); nativeClick(); });
    await act(async () => resolveWallet(wallet()));
    expect(orderChannelPosts).not.toHaveBeenCalled();
    expect(button('buyurtma berish')?.disabled).toBe(false);
  });
  it('unregisters its single native action when leaving the purchase page', async () => {
    await render(); expect(native.onClick).toHaveBeenCalledOnce();
    const listener = native.onClick.mock.calls[0][0];
    await act(async () => root.render(null));
    expect(native.offClick).toHaveBeenCalledWith(listener); expect(native.hide).toHaveBeenCalledOnce();
  });
  it('treats network failure after ordering as uncertain and never immediately resends', async () => {
    vi.mocked(orderChannelPosts).mockRejectedValue(new TypeError('Network failed'));
    await render(); await confirm();
    expect(container.textContent).toContain('Buyurtma natijasi aniqlanmadi');
    expect(button('buyurtma berish')).toBeUndefined();
    await click('Tarix va hamyonni tekshirish');
    expect(orderChannelPosts).toHaveBeenCalledTimes(1);
    await click('Yangi tanlovni boshlash'); expect(orderChannelPosts).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-selected]')?.getAttribute('data-selected')).toBe('');
  });
  it('shows only actual delivered counts and sends reposts through the same review', async () => {
    vi.mocked(listPostedChannels).mockResolvedValue([
      { channelId: 'channel-a', channelTitle: 'Birinchi kanal', postedCount: 2, lastPostedAt: '2026-09-01T00:00:00Z', channelActive: true, currentPriceSom: 10000 },
      { channelId: 'channel-b', channelTitle: 'Ikkinchi kanal', postedCount: 0, lastPostedAt: null, channelActive: true, currentPriceSom: 15000 },
    ]);
    await render([]); expect(container.textContent).toContain('2 marta chiqqan'); expect(container.textContent).toContain('Chiqishi hali tasdiqlanmagan');
    await click('Qayta joylashni ko‘rish'); expect(container.textContent).toContain('Bu alohida yangi buyurtma'); expect(orderChannelPosts).not.toHaveBeenCalled();
  });
  it('recovers catalogue loading with a read-only retry', async () => {
    vi.mocked(searchChannels).mockRejectedValueOnce(new Error('Kanallar yuklanmadi'));
    await render(); expect(button('Qayta urinish')).toBeDefined(); await click('Qayta urinish');
    expect(container.textContent).toContain('Buyurtmani tekshiring'); expect(orderChannelPosts).not.toHaveBeenCalled();
  });
  it('refreshes delivered history on returning to the page without placing orders', async () => {
    await render(); const before = vi.mocked(listPostedChannels).mock.calls.length;
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(vi.mocked(listPostedChannels).mock.calls.length).toBeGreaterThan(before); expect(orderChannelPosts).not.toHaveBeenCalled();
  });
});
