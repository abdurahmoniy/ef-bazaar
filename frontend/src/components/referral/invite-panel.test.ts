// @vitest-environment jsdom

import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InvitePanel } from './invite-panel';
import type { MyReferrals } from '@/lib/referrals';

const { trackGrowth } = vi.hoisted(() => ({ trackGrowth: vi.fn() }));
vi.mock('@/lib/growth-analytics', () => ({ trackGrowth }));

const referrals: MyReferrals = {
  code: 'ABCD2345', invitedCount: 2, rewardedCount: 1, earnedSom: 5000, rewardSom: 5000,
  invited: [
    { userId: '1', displayName: 'Ali', joinedAt: '2026-09-01T12:00:00Z', rewardedAt: '2026-09-02T12:00:00Z', rewardSom: 5000 },
    { userId: '2', displayName: 'Vali', joinedAt: '2026-09-03T12:00:00Z', rewardedAt: null, rewardSom: null },
  ],
};
let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json(referrals)));
  vi.stubGlobal('fetch', fetchMock);
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  trackGrowth.mockClear();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const render = (botUsername = 'efbazaar_bot') => act(async () => root.render(createElement(InvitePanel, { botUsername })));
function button(label: string) {
  return Array.from(container.querySelectorAll('button')).find((node) => node.textContent?.includes(label))!;
}
async function click(node: HTMLElement) {
  expect(node).toBeTruthy();
  await act(async () => node.click());
}

describe('InvitePanel', () => {
  it('shares the configured bot link through Telegram with an editable message', async () => {
    await render();
    const share = Array.from(container.querySelectorAll('a')).find((node) => node.textContent?.includes('Telegramda yuborish'))!;
    expect(share).toBeTruthy();
    const url = new URL(share.href);
    expect(url.origin + url.pathname).toBe('https://t.me/share/url');
    expect(url.searchParams.get('url')).toBe('https://t.me/efbazaar_bot?start=ref_ABCD2345');
    expect(url.searchParams.get('text')).toContain('EFBazaar');
    expect(container.textContent).toContain('Telegramda o‘zgartirishingiz mumkin');
    share.addEventListener('click', (event) => event.preventDefault());
    await click(share);
    expect(trackGrowth).toHaveBeenCalledWith('invite_share_intent', { placement: 'invite_page', method: 'telegram' });
    expect(container.textContent).not.toContain('Bot havolasi');
    expect(container.textContent).not.toContain('Sayt havolasi');
  });

  it('uses the public site link when no bot is configured', async () => {
    await render('');
    const share = container.querySelector<HTMLAnchorElement>('a[href^="https://t.me/share/url"]')!;
    expect(share).toBeTruthy();
    expect(new URL(share.href).searchParams.get('url')).toBe(`${window.location.origin}/?ref=ABCD2345`);
  });

  it('copies the invitation with visible accessible success feedback', async () => {
    await render();
    await click(button('Havolani nusxalash'));
    expect(writeText).toHaveBeenCalledWith('https://t.me/efbazaar_bot?start=ref_ABCD2345');
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Havola nusxalandi');
    expect(trackGrowth).toHaveBeenCalledWith('invite_copy_success', { placement: 'invite_page', method: 'copy' });
  });

  it('offers the complete selectable URL when clipboard access is denied', async () => {
    writeText.mockRejectedValue(new DOMException('Blocked', 'NotAllowedError'));
    await render();
    await click(button('Havolani nusxalash'));
    const fallback = container.querySelector<HTMLTextAreaElement>('textarea[readonly]')!;
    expect(fallback).toBeTruthy();
    expect(fallback.value).toBe('https://t.me/efbazaar_bot?start=ref_ABCD2345');
    expect(container.querySelector(`label[for="${fallback.id}"]`)?.textContent).toContain('Taklif havolangiz');
    expect(fallback.selectionStart).toBe(0);
    expect(fallback.selectionEnd).toBe(fallback.value.length);
    expect(container.textContent).toContain('qo‘lda nusxalang');
    expect(trackGrowth).not.toHaveBeenCalledWith('invite_copy_success', expect.anything());
  });

  it('retries a failed load and reveals the returned live reward and progress', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network failed'));
    await render();
    expect(container.querySelector('[role="alert"]')).toBeTruthy();
    await click(button('Qayta urinish'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain('birinchi savdosini muvaffaqiyatli yakunlaganda');
    expect(container.textContent).toContain('Qo‘shilgan do‘stlar');
    expect(container.textContent).toContain('Mukofot tushgan');
    expect(container.textContent).toContain('Jami mukofot');
    expect(container.querySelector('a[href="/hamyon"]')).toBeTruthy();
    expect(container.querySelectorAll('ol li')).toHaveLength(3);
    expect(container.textContent).toContain('Mukofot hali tushmagan');
    expect(container.textContent).not.toContain('Savdo kutilmoqda');
  });

  it('does not promise money when the live reward is zero', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...referrals, rewardSom: 0, invited: [], invitedCount: 0, rewardedCount: 0, earnedSom: 0 }));
    await render();
    expect(container.textContent).toContain('Hozir pul mukofoti belgilanmagan');
    expect(container.textContent).not.toContain('hamyoningizga tushadi');
    expect(container.querySelector('a[href^="https://t.me/share/url"]')).toBeTruthy();
    expect(container.textContent).toContain('Birinchi do‘stingizni taklif qiling');
  });

  it('records a single page view under StrictMode without private fields', async () => {
    await act(async () => root.render(createElement(StrictMode, null, createElement(InvitePanel, { botUsername: 'efbazaar_bot' }))));
    expect(trackGrowth.mock.calls.filter(([event]) => event === 'invite_view')).toEqual([
      ['invite_view', { placement: 'invite_page' }],
    ]);
  });
});
