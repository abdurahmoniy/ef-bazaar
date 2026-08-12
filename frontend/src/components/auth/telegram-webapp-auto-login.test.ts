// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TelegramWebAppAutoLogin } from './telegram-webapp-auto-login';

let container: HTMLDivElement;
let root: Root;
let submit: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
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
  delete window.Telegram;
});

function submittedField(name: string) {
  return document.querySelector<HTMLFormElement>('form[action="/api/telegram-webapp"]')
    ?.elements.namedItem(name) as HTMLInputElement | null;
}

describe('TelegramWebAppAutoLogin', () => {
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

  it('silently ignores the same SDK initData after a previous auto-login attempt without a fresh launch hash', async () => {
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
    expect(container.textContent).toBe('');
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
