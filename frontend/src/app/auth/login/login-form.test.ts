// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TelegramAuthData } from '@/lib/types';

const { telegramAuthAction, googleLoginAction } = vi.hoisted(() => ({
  telegramAuthAction: vi.fn(), googleLoginAction: vi.fn(),
}));
vi.mock('@/app/auth/actions', () => ({ telegramAuthAction, googleLoginAction }));
vi.mock('@/components/auth/telegram-login', () => ({
  TelegramLogin: ({ onAuth, onRenderIssue }: {
    onAuth: (data: TelegramAuthData) => Promise<void>;
    onRenderIssue?: (reason: 'iframe_missing') => void;
  }) => createElement('div', null,
    createElement('button', { onClick: () => void onAuth({ id: 123 } as TelegramAuthData) }, 'Telegram sign-in'),
    createElement('button', { onClick: () => onRenderIssue?.('iframe_missing') }, 'Widget unavailable'),
  ),
}));
vi.mock('@/components/auth/google-button', () => ({
  GoogleButton: ({ onCredential, disabled, label }: {
    onCredential: (token: string) => Promise<void>; disabled?: boolean; label: string;
  }) => createElement('button', { disabled, onClick: () => void onCredential('google-token') }, label),
}));

import { LoginForm } from './login-form';

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(googleClientId = 'google-client', initialError?: string) {
  await act(async () => root.render(createElement(LoginForm, {
    botUsername: 'test_bot', googleClientId, from: '/marketplace/new', initialError,
  })));
}
function button(label: string) {
  const match = [...container.querySelectorAll('button')].find((el) => el.textContent === label);
  expect(match, `button: ${label}`).toBeDefined();
  return match!;
}

describe('login provider states', () => {
  it('announces the existing login error and keeps both sign-in options available', async () => {
    await render('google-client', 'Telegram ma’lumotlari eskirgan');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Telegram ma’lumotlari eskirgan');
    expect(button('Telegram sign-in').disabled).toBe(false);
    expect(button('Google bilan kirish').disabled).toBe(false);
  });

  it('recovers from a missing widget with retry, available Google, and help', async () => {
    await render();
    await act(async () => button('Widget unavailable').click());
    expect(container.textContent).toContain('Telegram yuklanmadi');
    expect(container.textContent).toContain('Google orqali');
    expect(container.querySelector('a[href="/help"]')).not.toBeNull();
    await act(async () => button('Qayta urinish').click());
    expect(container.textContent).not.toContain('Telegram yuklanmadi');
    expect(button('Telegram sign-in')).toBeDefined();
  });

  it('does not suggest Google when that provider is unavailable', async () => {
    await render('');
    await act(async () => button('Widget unavailable').click());
    expect(container.textContent).toContain('Telegram yuklanmadi');
    expect(container.textContent).not.toContain('Google');
    expect(container.querySelector('a[href="/help"]')).not.toBeNull();
  });

  it('announces progress and preserves the Telegram destination and returned error', async () => {
    let complete!: (value: { ok: boolean; error: string }) => void;
    telegramAuthAction.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    await render();
    await act(async () => button('Telegram sign-in').click());
    expect(telegramAuthAction).toHaveBeenCalledWith({ id: 123 }, '/marketplace/new');
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Kirilmoqda');
    expect(container.querySelector('[role="status"]')?.closest('[aria-busy="true"]')).toBeNull();
    expect(button('Google bilan kirish').disabled).toBe(true);
    await act(async () => complete({ ok: false, error: 'Kirishni qayta sinab ko‘ring' }));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Kirishni qayta sinab ko‘ring');
    expect(button('Google bilan kirish').disabled).toBe(false);
  });

  it('forwards the Google credential and destination through the existing action', async () => {
    googleLoginAction.mockResolvedValue({ ok: false, error: 'Google orqali kirib bo‘lmadi' });
    await render();
    await act(async () => button('Google bilan kirish').click());
    expect(googleLoginAction).toHaveBeenCalledWith('google-token', '/marketplace/new');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Google orqali kirib bo‘lmadi');
  });
});
