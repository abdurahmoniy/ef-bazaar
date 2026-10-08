// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/notifications-client', () => ({ fetchNotifications: vi.fn(), markNotificationRead: vi.fn().mockResolvedValue(undefined), notificationHref: () => '/chats/chat', notificationLabel: () => 'Konami kirish kodi' }));
import { fetchNotifications } from '@/lib/notifications-client';
import { VerificationCodeDialog } from './verification-code-dialog';
let root: Root; let host: HTMLDivElement;
const n = { id: 'code', type: 'TRADE_LOGIN_CODE' as const, tradeId: 'trade', verificationCode: '001234', createdAt: new Date().toISOString() };
beforeEach(() => { sessionStorage.clear(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host); vi.mocked(fetchNotifications).mockResolvedValue([n]); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); });
it('shows without push permission and does not repeat dismissed codes after remount', async () => {
  await act(async () => root.render(createElement(VerificationCodeDialog, { userId: 'a' })));
  expect(document.body.textContent).toContain('001234');
  await act(async () => (document.querySelector('[data-code-dismiss]') as HTMLButtonElement).click());
  await act(async () => root.render(null));
  await act(async () => root.render(createElement(VerificationCodeDialog, { userId: 'a' })));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
it('discards an asynchronous result after user change', async () => {
  let resolve!: (value: typeof n[]) => void;
  vi.mocked(fetchNotifications).mockReturnValueOnce(new Promise(r => { resolve = r; })).mockResolvedValueOnce([]);
  await act(async () => root.render(createElement(VerificationCodeDialog, { userId: 'a' })));
  await act(async () => root.render(createElement(VerificationCodeDialog, { userId: 'b' })));
  await act(async () => resolve([n]));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
it('copies the exact code and automatically removes an expired code', async () => {
  vi.useFakeTimers();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  vi.mocked(fetchNotifications).mockResolvedValue([{ ...n, createdAt: new Date(Date.now() - 299000).toISOString() }]);
  await act(async () => root.render(createElement(VerificationCodeDialog, { userId: 'copy-user' })));
  await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Kodni nusxalash')!.click());
  expect(writeText).toHaveBeenCalledWith('001234');
  await act(async () => vi.advanceTimersByTimeAsync(1002));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  vi.useRealTimers();
});
it('replaces a code for the same trade and purpose on refresh', async () => {
  await act(async () => root.render(createElement(VerificationCodeDialog, { userId: 'a' })));
  const newer = { ...n, id: 'new', verificationCode: '765432', createdAt: new Date(Date.now() + 1).toISOString() };
  vi.mocked(fetchNotifications).mockResolvedValue([n, { ...newer, createdAt: new Date().toISOString() }]);
  await act(async () => window.dispatchEvent(new Event('efbazaar:notifications-changed')));
  // Focus also refreshes when there is no push transport.
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(document.body.textContent).toContain('765432');
  expect(document.body.textContent).not.toContain('001234');
});
