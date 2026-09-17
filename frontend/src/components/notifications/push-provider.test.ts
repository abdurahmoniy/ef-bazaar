// @vitest-environment jsdom
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
vi.mock('next/navigation', () => ({ usePathname: () => '/notifications' }));
vi.mock('@/lib/firebase-push', () => ({
  enablePush: vi.fn(), disablePush: vi.fn(), syncPushSubscription: vi.fn(),
  listenForPush: vi.fn().mockResolvedValue(() => {}), NOTIFICATIONS_CHANGED: 'notifications-changed',
}));
import { enablePush, syncPushSubscription } from '@/lib/firebase-push';
import { PushProvider, usePushNotifications } from './push-provider';
let root: Root; let container: HTMLDivElement;
function Controls() {
  const { state, enable } = usePushNotifications();
  return createElement('button', { onClick: enable }, state);
}
beforeEach(() => {
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
    expect(container.textContent).toBe('available');
    await act(async () => container.querySelector('button')!.click());
    expect(container.textContent).toBe('error');
  });
});
