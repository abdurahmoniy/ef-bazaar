// @vitest-environment jsdom

import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TelegramWebAppAutoLogin } from './telegram-webapp-auto-login';

let container: HTMLDivElement;
let root: Root;
let submit: ReturnType<typeof vi.spyOn>;
const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
  router.replace.mockClear();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState({}, '', '/marketplace');
  document.querySelectorAll('form[action="/api/telegram-webapp"]').forEach((form) => form.remove());
  delete window.Telegram;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => undefined);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  submit.mockRestore();
  window.sessionStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete window.Telegram;
});

function submittedField(name: string) {
  return document.querySelector<HTMLFormElement>('form[action="/api/telegram-webapp"]')
    ?.elements.namedItem(name) as HTMLInputElement | null;
}

describe('TelegramWebAppAutoLogin', () => {
  const initData = new URLSearchParams({ user: JSON.stringify({ id: 123 }), auth_date: '1789403290', hash: 'test-hash' }).toString();

  it('leaves an authenticated chat usable when its session matches the Telegram user', async () => {
    window.history.replaceState({}, '', `/chats/chat-123#tgWebAppData=${encodeURIComponent(initData)}`);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ telegramId: 123 })));
    await act(async () => root.render(createElement(TelegramWebAppAutoLogin)));
    expect(submit).not.toHaveBeenCalled();
    expect(container.textContent).toBe('');
    expect(window.location.pathname).toBe('/chats/chat-123');
    expect(window.location.hash).toBe('');
  });

  it.each([null, 456])('authenticates when the current session belongs to %s', async (telegramId) => {
    window.history.replaceState({}, '', `/chats/chat-123#tgWebAppData=${encodeURIComponent(initData)}`);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ telegramId })));
    await act(async () => root.render(createElement(TelegramWebAppAutoLogin)));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submittedField('initData')?.value).toBe(initData);
    expect(submittedField('from')?.value).toBe('/chats/chat-123');
  });

  it('returns to the requested chat when the session is already valid on the login page', async () => {
    window.history.replaceState({}, '', `/auth/login?from=%2Fchats%2Fchat-123#tgWebAppData=${encodeURIComponent(initData)}`);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ telegramId: 123 })));
    await act(async () => root.render(createElement(TelegramWebAppAutoLogin)));
    expect(submit).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/chats/chat-123');
  });

  it('recovers a stalled form submission and retries the original launch data and chat', async () => {
    window.history.replaceState({}, '', '/chats/chat-123#tgWebAppData=signed-data');
    await act(async () => root.render(createElement(TelegramWebAppAutoLogin)));
    await act(async () => vi.advanceTimersByTime(20000));
    expect(container.textContent).not.toContain('avtomatik kirilmoqda');
    expect(container.querySelector('button')?.textContent).toContain('Qayta urinish');
    await act(async () => container.querySelector('button')!.click());
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submittedField('initData')?.value).toBe('signed-data');
    expect(submittedField('from')?.value).toBe('/chats/chat-123');
  });

  it('allows retry after a synchronous submission failure', async () => {
    window.history.replaceState({}, '', '/chats/chat-123#tgWebAppData=signed-data');
    submit.mockImplementationOnce(() => { throw new Error('Navigation blocked'); });
    await act(async () => root.render(createElement(TelegramWebAppAutoLogin)));
    await act(async () => container.querySelector('button')!.click());
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it('falls back to form login if the session check stalls', async () => {
    window.history.replaceState({}, '', `/chats/chat-123#tgWebAppData=${encodeURIComponent(initData)}`);
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
    await act(async () => root.render(createElement(TelegramWebAppAutoLogin)));
    await act(async () => vi.advanceTimersByTime(4000));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submittedField('from')?.value).toBe('/chats/chat-123');
  });

  it('submits only once under Strict Mode and still recovers a stalled navigation', async () => {
    window.history.replaceState({}, '', '/chats/chat-123#tgWebAppData=signed-data');
    await act(async () => root.render(createElement(StrictMode, null, createElement(TelegramWebAppAutoLogin))));
    expect(submit).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(20000));
    expect(container.querySelector('button')?.textContent).toContain('Qayta urinish');
  });

  it('submits hash initData exactly once and preserves unrelated hash fields', async () => {
    window.history.replaceState({}, '', '/marketplace?from=%2Fprofile#section=players&tgWebAppData=signed-data&tgWebAppVersion=8.0');

    await act(async () => root.render(createElement(TelegramWebAppAutoLogin)));

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submittedField('initData')?.value).toBe('signed-data');
    expect(submittedField('from')?.value).toBe('/profile');
    expect(window.location.hash).toBe('#section=players');
  });

  it('preserves a conventional app anchor when SDK initData is already available', async () => {
    window.history.replaceState({}, '', '/marketplace#marketplace-player-filter');
    window.Telegram = { WebApp: { initData: 'signed-from-sdk' } } as typeof window.Telegram;

    await act(async () => root.render(createElement(TelegramWebAppAutoLogin)));

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submittedField('from')?.value).toBe('/marketplace#marketplace-player-filter');
    expect(window.location.hash).toBe('#marketplace-player-filter');
  });

  it('waits briefly for delayed SDK hydration in a real Telegram launch', async () => {
    window.history.replaceState({}, '', '/marketplace#tgWebAppVersion=8.0&tgWebAppPlatform=android');
    await act(async () => root.render(createElement(TelegramWebAppAutoLogin)));
    expect(submit).not.toHaveBeenCalled();

    window.Telegram = { WebApp: { initData: 'late-signed-data' } } as typeof window.Telegram;
    await act(async () => vi.advanceTimersByTime(150));

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submittedField('initData')?.value).toBe('late-signed-data');
  });

  it('does not poll or submit in an ordinary browser with an empty SDK object', async () => {
    window.Telegram = { WebApp: { initData: '' } } as typeof window.Telegram;
    await act(async () => root.render(createElement(TelegramWebAppAutoLogin)));
    await act(async () => vi.advanceTimersByTime(5000));

    expect(submit).not.toHaveBeenCalled();
    expect(container.textContent).toBe('');
  });

  it('offers recovery instead of silently skipping an unverified previous login attempt', async () => {
    window.Telegram = {
      WebApp: {
        initData: 'user=%7B%22id%22%3A123%7D&auth_date=1786540000&hash=same-hash',
      },
    } as typeof window.Telegram;

    await act(async () => root.render(createElement(TelegramWebAppAutoLogin)));
    expect(submit).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    container.textContent = '';
    submit.mockClear();
    root = createRoot(container);
    window.history.replaceState({}, '', '/auth/login?from=%2Fprofile');

    await act(async () => root.render(createElement(TelegramWebAppAutoLogin)));

    expect(submit).not.toHaveBeenCalled();
    expect(container.querySelector('button')?.textContent).toContain('Qayta urinish');
  });

  it('stops waiting after unmount', async () => {
    window.history.replaceState({}, '', '/marketplace#tgWebAppVersion=8.0&tgWebAppPlatform=ios');
    await act(async () => root.render(createElement(TelegramWebAppAutoLogin)));
    await act(async () => root.unmount());
    window.Telegram = { WebApp: { initData: 'too-late' } } as typeof window.Telegram;
    await act(async () => vi.advanceTimersByTime(500));

    expect(submit).not.toHaveBeenCalled();
  });

  it('stops after the bounded hydration window and offers recovery', async () => {
    window.history.replaceState({}, '', '/marketplace#tgWebAppVersion=8.0&tgWebAppPlatform=ios');
    await act(async () => root.render(createElement(TelegramWebAppAutoLogin)));
    await act(async () => vi.advanceTimersByTime(3000));

    expect(submit).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Telegram ma’lumotlari yuklanmadi');
    expect(container.querySelector('button')?.textContent).toContain('Qayta urinish');
  });
});
