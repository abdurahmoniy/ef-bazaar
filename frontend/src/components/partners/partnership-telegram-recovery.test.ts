// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/app/auth/actions', () => ({ linkTelegramAction: vi.fn() }));
import { LinkTelegramButton } from '@/components/profile/link-telegram-button';
let container: HTMLDivElement; let root: Root;
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers(); vi.clearAllMocks(); vi.spyOn(console, 'warn').mockImplementation(() => {});
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
const render = (botUsername: string) => act(async () => root.render(createElement(LinkTelegramButton, { botUsername, alreadyLinked: false })));
const retry = () => Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Qayta urinish'));
describe('Telegram linking recovery', () => {
  it('uses plain recovery text and reloads the actual widget after its button fails to appear', async () => {
    await render('test_bot');
    const initialScript = container.querySelector('script'); expect(initialScript).not.toBeNull();
    await act(async () => vi.advanceTimersByTime(4000));
    expect(container.textContent).toContain('Telegram tugmasi yuklanmadi');
    expect(container.textContent).not.toMatch(/NEXT_PUBLIC|env variable|Deploy|BotFather|setdomain/);
    expect(container.querySelector('a[href="/help"]')).not.toBeNull();
    expect(retry()).toBeDefined();
    await act(async () => retry()!.click());
    expect(container.querySelector('script')).not.toBe(initialScript);
    expect(container.querySelector('script')?.getAttribute('data-telegram-login')).toBe('test_bot');
    expect(container.textContent).not.toContain('Telegram tugmasi yuklanmadi');
  });
  it('offers support and reloads current server configuration when no bot is available', async () => {
    await render('');
    expect(container.textContent).not.toMatch(/NEXT_PUBLIC|env variable|Deploy|BotFather|setdomain/);
    expect(container.querySelector('a[href="/help"]')).not.toBeNull();
    expect(retry()).toBeDefined();
    await act(async () => retry()!.click());
    expect(refresh).toHaveBeenCalledOnce();
  });
});
