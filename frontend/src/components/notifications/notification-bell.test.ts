// @vitest-environment jsdom
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/notifications-client', () => ({
  fetchUnreadCount: vi.fn().mockResolvedValue(3), fetchNotifications: vi.fn().mockResolvedValue([]),
  markAllNotificationsRead: vi.fn(), markNotificationRead: vi.fn(), notificationHref: vi.fn(), notificationLabel: vi.fn(),
}));
import { NotificationBell } from './notification-bell';
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  push.mockClear();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
describe('notification bell', () => {
  it('opens the full notification page on mobile with a readable unread count', async () => {
    await act(async () => root.render(createElement(NotificationBell)));
    const button = container.querySelector('button')!;
    expect(button.getAttribute('aria-label')).toContain('3');
    await act(async () => button.click());
    expect(push).toHaveBeenCalledWith('/notifications');
    expect(container.textContent).not.toContain("Hozircha");
  });
  it('retains the desktop dropdown', async () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: false } as MediaQueryList);
    await act(async () => root.render(createElement(NotificationBell)));
    await act(async () => container.querySelector('button')!.click());
    expect(push).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Hozircha bildirishnomalar yo'q.");
  });
});
