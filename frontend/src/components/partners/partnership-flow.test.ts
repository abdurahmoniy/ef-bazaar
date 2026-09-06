// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PartnershipFlow } from './partnership-flow';
import { applyForPartnership, getMyApplication, getPartnerSettings } from '@/lib/partners';
import type { PartnerApplication, PartnerApplicationStatus } from '@/lib/partners';

vi.mock('@/lib/partners', () => ({
  getPartnerSettings: vi.fn(), getMyApplication: vi.fn(), applyForPartnership: vi.fn(),
  cancelPartnership: vi.fn(), payPartnershipFee: vi.fn(),
}));
vi.mock('@/lib/growth-analytics', () => ({ trackGrowth: vi.fn() }));
vi.mock('@/components/profile/link-telegram-button', () => ({
  LinkTelegramButton: ({ botUsername, alreadyLinked }: { botUsername: string; alreadyLinked: boolean }) =>
    createElement('div', { 'data-telegram-link': botUsername, 'data-already-linked': alreadyLinked }, 'Telegramni ulash'),
}));

const application = (status: PartnerApplicationStatus): PartnerApplication => ({
  id: 'application', userId: 'user', status, channelId: null, channelTitle: null,
  channelUsername: null, subscriberCount: null, verifiedAt: null, verificationError: null,
  invoiceId: null, paidAt: null, reviewedAt: null, reviewNote: null, cancelReason: null,
  cancelledAt: null, createdAt: '2026-09-01T00:00:00Z',
});
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  vi.mocked(getPartnerSettings).mockResolvedValue({ minSubscribers: 700, priceSom: 15000, defaultPayoutMode: 'PERCENT', defaultTradePercentBp: 1000, defaultFixedMonthlySom: 0, referralRewardSom: 200, updatedAt: '' });
  vi.mocked(getMyApplication).mockResolvedValue(null);
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.useRealTimers();
});
const render = async (authenticated = true, telegramLinked = true) => {
  await act(async () => root.render(createElement(PartnershipFlow, { botUsername: 'test_bot', authenticated, telegramLinked })));
};
const button = (text: string) => Array.from(container.querySelectorAll('button')).find(el => el.textContent?.includes(text));
const click = async (text: string) => {
  const target = button(text); expect(target, `Missing button: ${text}`).toBeDefined();
  await act(async () => target!.click());
};

describe('PartnershipFlow', () => {
  it('shows guest benefits and return-to-partnership sign-in without authenticated API calls', async () => {
    await render(false);
    expect(getPartnerSettings).not.toHaveBeenCalled(); expect(getMyApplication).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Narxni o‘zingiz belgilang');
    expect(container.textContent).toContain('Namuna');
    expect(container.querySelector('header a[href="/auth/login?from=/partnership"]')).not.toBeNull();
    expect(container.querySelector('a[href^="https://t.me/"]')).toBeNull();
  });
  it('asks a Google-only user to link the owner Telegram account before applying', async () => {
    await render(true, false);
    expect(container.textContent).toContain('Kanal egasining Telegram akkauntini ulang');
    expect(container.querySelector('[data-telegram-link="test_bot"]')?.getAttribute('data-already-linked')).toBe('false');
    expect(button('Ariza topshirish')).toBeUndefined();
    expect(container.querySelector('a[href*="startchannel"]')).toBeNull();
    expect(applyForPartnership).not.toHaveBeenCalled();
    await render(true, true);
    expect(container.querySelector('[data-telegram-link]')).toBeNull();
    expect(button('Ariza topshirish')).toBeDefined();
  });
  it('requires Telegram linking for an existing application before offering bot connection', async () => {
    vi.mocked(getMyApplication).mockResolvedValue(application('AWAITING_CHANNEL'));
    await render(true, false);
    expect(container.querySelector('[data-telegram-link]')).not.toBeNull();
    expect(container.querySelector('a[href*="startchannel"]')).toBeNull();
    await render(true, true);
    expect(container.querySelector('a[href*="startchannel"]')).not.toBeNull();
  });
  it('keeps the panel route available for an approved partner', async () => {
    vi.mocked(getMyApplication).mockResolvedValue(application('APPROVED'));
    await render(true, false);
    expect(container.querySelector('a[href="/partner"]')).not.toBeNull();
    expect(container.querySelector('[data-telegram-link]')).toBeNull();
  });
  it('requires application creation before offering bot addition', async () => {
    await render();
    expect(button('Ariza topshirish')).toBeDefined();
    expect(container.querySelector('header a[href="#application"]')).not.toBeNull();
    expect(container.querySelector('a[href^="https://t.me/"]')).toBeNull();
    vi.mocked(applyForPartnership).mockResolvedValue(application('AWAITING_CHANNEL'));
    await click('Ariza topshirish');
    expect(container.querySelector('a[href^="https://t.me/"]')?.getAttribute('href')).toBe('https://t.me/test_bot?startchannel&admin=post_messages');
  });
  it.each(['REJECTED', 'CANCELLED'] as const)('starts a new sequence for %s without completed steps', async (status) => {
    vi.mocked(getMyApplication).mockResolvedValue(application(status)); await render();
    expect(button('Yangi ariza ochish')).toBeDefined();
    expect(container.querySelectorAll('[data-step-state="done"]')).toHaveLength(0);
    expect(container.querySelector('[data-step-state="active"]')?.textContent).toContain('Ariza ochish');
    expect(container.querySelector('a[href^="https://t.me/"]')).toBeNull();
  });
  it('does not present a new application after a failed load and recovers with retry', async () => {
    vi.mocked(getMyApplication).mockRejectedValueOnce(new Error('Ulanish uzildi')); await render();
    expect(container.textContent).toContain('Ulanish uzildi');
    expect(button('Ariza topshirish')).toBeUndefined();
    await click('Qayta urinish');
    expect(button('Ariza topshirish')).toBeDefined(); expect(container.textContent).not.toContain('Ulanish uzildi');
  });
  it.each(['AWAITING_CHANNEL', 'AWAITING_PAYMENT', 'AWAITING_REVIEW'] as const)('refreshes %s on focus and while awaiting', async (status) => {
    vi.useFakeTimers(); vi.mocked(getMyApplication).mockResolvedValue(application(status)); await render();
    const initial = vi.mocked(getMyApplication).mock.calls.length;
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(getMyApplication).toHaveBeenCalledTimes(initial + 1);
    await act(async () => vi.advanceTimersByTime(15000));
    expect(vi.mocked(getMyApplication).mock.calls.length).toBeGreaterThan(initial + 1);
  });
  it('explains review notification and shows no bot action after payment', async () => {
    vi.mocked(getMyApplication).mockResolvedValue(application('AWAITING_REVIEW')); await render();
    expect(container.textContent).toContain('saytda va Telegram');
    expect(container.querySelector('a[href^="https://t.me/"]')).toBeNull();
  });
});
