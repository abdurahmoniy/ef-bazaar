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
let root: Root; let container: HTMLDivElement;
function Controls() {
  const { state, enable, disable } = usePushNotifications();
  return createElement('div', null,
    createElement('button', { onClick: enable, 'data-control': 'enable' }, state),
    createElement('button', { onClick: disable, 'data-control': 'disable' }, 'disable'));
}
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ userId: 'a', config: {}, vapidKey: 'key' }))));
  vi.mocked(syncPushSubscription).mockResolvedValue('available');
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('push controls', () => {
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
