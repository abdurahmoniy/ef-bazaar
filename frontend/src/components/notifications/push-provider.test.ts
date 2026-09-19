// @vitest-environment jsdom
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
vi.mock('next/navigation', () => ({ usePathname: () => '/notifications' }));
vi.mock('@/lib/firebase-push', () => ({
  enablePush: vi.fn(), disablePush: vi.fn(), syncPushSubscription: vi.fn(),
  listenForPush: vi.fn().mockResolvedValue(() => {}), NOTIFICATIONS_CHANGED: 'notifications-changed',
}));
import { disablePush, enablePush, syncPushSubscription } from '@/lib/firebase-push';
import { PushProvider, usePushNotifications } from './push-provider';
import { PushSettings } from './push-settings';
let root: Root; let container: HTMLDivElement;
function Controls() {
  const { state, enable, disable } = usePushNotifications();
  return createElement('div', null,
    createElement('button', { onClick: enable, 'data-control': 'enable' }, state),
    createElement('button', { onClick: disable, 'data-control': 'disable' }, 'disable'));
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal('Notification', { permission: 'granted' });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ userId: 'a', config: {}, vapidKey: 'key' }))));
  vi.mocked(syncPushSubscription).mockResolvedValue('available');
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('push controls', () => {
  it('requests permission immediately after authenticated configuration loads', async () => {
    vi.stubGlobal('Notification', { permission: 'default' });
    vi.mocked(enablePush).mockResolvedValue('enabled');
    await act(async () => root.render(createElement(PushProvider, null, createElement(Controls))));
    expect(enablePush).toHaveBeenCalledOnce();
    expect(container.querySelector('[data-control="enable"]')?.textContent).toBe('enabled');
  });
  it('keeps the tap fallback when the browser rejects an automatic request, without repeating on focus or reload', async () => {
    vi.stubGlobal('Notification', { permission: 'default' });
    vi.mocked(enablePush).mockImplementation(() => { throw new Error('User gesture required'); });
    await act(async () => root.render(createElement(PushProvider, null, createElement(Controls))));
    expect(enablePush).toHaveBeenCalledOnce();
    expect(container.querySelector('[data-enable-push]')).not.toBeNull();
    await act(async () => window.dispatchEvent(new Event('focus')));
    await act(async () => root.unmount()); root = createRoot(container);
    await act(async () => root.render(createElement(PushProvider, null, createElement(Controls))));
    expect(enablePush).toHaveBeenCalledOnce();
    vi.mocked(enablePush).mockResolvedValue('enabled');
    await act(async () => container.querySelector<HTMLButtonElement>('[data-enable-push]')!.click());
    expect(enablePush).toHaveBeenCalledTimes(2);
  });
  it('does not automatically prompt signed-out users', async () => {
    vi.stubGlobal('Notification', { permission: 'default' });
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ userId: null, config: null, vapidKey: '' })));
    await act(async () => root.render(createElement(PushProvider, null, createElement(Controls))));
    expect(enablePush).not.toHaveBeenCalled();
  });
  it.each(['denied', 'granted'])('does not request an already decided %s permission', async permission => {
    vi.stubGlobal('Notification', { permission });
    await act(async () => root.render(createElement(PushProvider, null, createElement(Controls))));
    expect(enablePush).not.toHaveBeenCalled();
  });
  it('honors an earlier invitation dismissal', async () => {
    vi.stubGlobal('Notification', { permission: 'default' });
    localStorage.setItem('efbazaar.push-prompt:a:available', 'dismissed');
    await act(async () => root.render(createElement(PushProvider, null, createElement(Controls))));
    expect(enablePush).not.toHaveBeenCalled();
  });
  it.each(['install', 'unsupported', 'unconfigured', 'enabled', 'denied'] as const)('does not automatically prompt in the %s state', async status => {
    vi.stubGlobal('Notification', { permission: 'default' });
    vi.mocked(syncPushSubscription).mockResolvedValue(status);
    await act(async () => root.render(createElement(PushProvider, null, createElement(Controls))));
    expect(enablePush).not.toHaveBeenCalled();
  });
  it('keeps a registration failure visible until the user retries', async () => {
    vi.mocked(enablePush).mockRejectedValue(new Error('Registration failed'));
    await act(async () => root.render(createElement(PushProvider, null, createElement(Controls))));
    expect(container.querySelector('[data-control="enable"]')?.textContent).toBe('available');
    await act(async () => container.querySelector<HTMLButtonElement>('[data-control="enable"]')!.click());
    expect(container.querySelector('[data-control="enable"]')?.textContent).toBe('error');
  });
  it('shows the invitation after login is detected and removes it on logout', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ userId: null, config: null, vapidKey: '' })));
    await act(async () => root.render(createElement(PushProvider, null, createElement(Controls))));
    expect(container.querySelector('aside')).toBeNull();
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ userId: 'a', config: {}, vapidKey: 'key' })));
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(container.querySelector('aside')).not.toBeNull();
    expect(enablePush).not.toHaveBeenCalled();
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ userId: null, config: null, vapidKey: '' })));
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(container.querySelector('aside')).toBeNull();
  });
  it('uses the global invitation to enable push and hides it after success', async () => {
    vi.mocked(enablePush).mockResolvedValue('enabled');
    await act(async () => root.render(createElement(PushProvider, null, createElement(Controls))));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-enable-push]')!.click());
    expect(enablePush).toHaveBeenCalledOnce();
    expect(container.querySelector('aside')).toBeNull();
  });
  it('does not invite a user again immediately after they disable push', async () => {
    vi.mocked(syncPushSubscription).mockResolvedValue('enabled');
    vi.mocked(disablePush).mockResolvedValue(undefined);
    await act(async () => root.render(createElement(PushProvider, null, createElement(Controls))));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-control="disable"]')!.click());
    expect(container.querySelector('[data-control="enable"]')?.textContent).toBe('available');
    expect(container.querySelector('aside')).toBeNull();
  });
});


describe('Telegram notification permission', () => {
  function miniApp(options: { granted?: boolean; supported?: boolean; allow?: boolean } = {}) {
    const requestWriteAccess = vi.fn((callback: (allowed: boolean) => void) => callback(options.allow ?? true));
    vi.stubGlobal('Telegram', { WebApp: {
      initData: 'signed-telegram-launch', ready: vi.fn(),
      initDataUnsafe: { user: { id: 123, allows_write_to_pm: options.granted } },
      isVersionAtLeast: () => options.supported ?? true, requestWriteAccess,
    } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ telegramId: 123 }))));
    return requestWriteAccess;
  }
  async function render() {
    await act(async () => root.render(createElement(PushProvider, null, createElement(Controls), createElement(PushSettings))));
  }
  it('automatically asks the matching Telegram user without Firebase or browser permission', async () => {
    const request = miniApp();
    // Telegram does not need the browser Notification API at all.
    Reflect.deleteProperty(window, 'Notification');
    await render();
    expect(request).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith('/api/telegram-webapp', expect.anything());
    expect(syncPushSubscription).not.toHaveBeenCalled();
    expect(enablePush).not.toHaveBeenCalled();
    expect(container.querySelector('[data-control="enable"]')?.textContent).toBe('enabled');
    expect(container.querySelector('section')).toBeNull();
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(container.querySelector('section')).toBeNull();
    expect(request).toHaveBeenCalledOnce();
  });
  it('hides the card without prompting when Telegram already allows bot messages', async () => {
    const request = miniApp({ granted: true });
    await render();
    expect(request).not.toHaveBeenCalled();
    expect(container.querySelector('section')).toBeNull();
  });
  it('keeps a manual retry after decline without automatically repeating on focus or remount', async () => {
    const request = miniApp({ allow: false });
    await render();
    expect(request).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Telegram');
    await act(async () => window.dispatchEvent(new Event('focus')));
    await act(async () => root.unmount()); root = createRoot(container);
    await render();
    expect(request).toHaveBeenCalledOnce();
    request.mockImplementation(callback => callback(true));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-enable-push]')!.click());
    expect(request).toHaveBeenCalledTimes(2);
    expect(container.querySelector('section')).toBeNull();
  });
  it.each([null, 456])('does not ask with an absent or different session (%s)', async telegramId => {
    const request = miniApp();
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ telegramId })));
    await render();
    await act(async () => container.querySelector<HTMLButtonElement>('[data-control="enable"]')!.click());
    expect(request).not.toHaveBeenCalled();
    expect(container.querySelector('aside')).toBeNull();
  });
  it('shows Telegram update guidance for an older client', async () => {
    const request = miniApp({ supported: false });
    await render();
    expect(request).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Telegram ilovasini yangilang');
    expect(container.textContent).not.toContain('Chrome');
  });
  it('retains a manual fallback if Telegram refuses an automatic request', async () => {
    const request = miniApp();
    request.mockImplementation(() => { throw new Error('Gesture required'); });
    await render();
    expect(container.querySelector('[data-enable-push]')).not.toBeNull();
    request.mockImplementation(callback => callback(true));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-enable-push]')!.click());
    expect(container.querySelector('section')).toBeNull();
  });
  it('recovers when Telegram never responds to its permission request', async () => {
    vi.useFakeTimers();
    const request = miniApp();
    request.mockImplementation(() => {});
    await render();
    expect(container.querySelector<HTMLButtonElement>('[data-enable-push]')!.disabled).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(container.querySelector<HTMLButtonElement>('[data-enable-push]')!.disabled).toBe(false);
    expect(request).toHaveBeenCalledOnce();
  });
  it('does not prompt if the session check fails', async () => {
    const request = miniApp();
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 503 }));
    await render();
    expect(request).not.toHaveBeenCalled();
    expect(container.querySelector('[data-control="enable"]')?.textContent).toBe('error');
  });
  it('uses Firebase in a regular browser even when the Telegram SDK is loaded', async () => {
    vi.stubGlobal('Telegram', { WebApp: { initData: '', ready: vi.fn() } });
    await render();
    expect(syncPushSubscription).toHaveBeenCalledOnce();
  });
});
