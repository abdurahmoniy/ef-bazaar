// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TelegramAuthData } from '@/lib/types';
const { refresh, linkTelegramAction } = vi.hoisted(() => ({ refresh: vi.fn(), linkTelegramAction: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/app/auth/actions', () => ({ linkTelegramAction }));
vi.mock('@/components/auth/telegram-login', () => ({ TelegramLogin: ({ onAuth }: { onAuth: (data: TelegramAuthData) => Promise<void> }) => createElement('button', { onClick: () => void onAuth({ id: 123 } as TelegramAuthData) }, 'Ulash') }));
import { LinkTelegramButton } from '@/components/profile/link-telegram-button';
let container: HTMLDivElement; let root: Root;
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
describe('Partnership inline Telegram linking', () => {
  it('refreshes the current route after successful linking so the application can continue in place', async () => {
    linkTelegramAction.mockResolvedValue({ ok: true });
    await act(async () => root.render(createElement(LinkTelegramButton, { botUsername: 'test_bot', alreadyLinked: false })));
    await act(async () => container.querySelector('button')!.click());
    expect(linkTelegramAction).toHaveBeenCalledWith({ id: 123 }); expect(refresh).toHaveBeenCalledOnce();
  });
  it('keeps linking errors visible without advancing the route', async () => {
    linkTelegramAction.mockResolvedValue({ ok: false, error: 'Telegram boshqa hisobga ulangan' });
    await act(async () => root.render(createElement(LinkTelegramButton, { botUsername: 'test_bot', alreadyLinked: false })));
    await act(async () => container.querySelector('button')!.click());
    expect(container.textContent).toContain('Telegram boshqa hisobga ulangan'); expect(refresh).not.toHaveBeenCalled();
  });
});
