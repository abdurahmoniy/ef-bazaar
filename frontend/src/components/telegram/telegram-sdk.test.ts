// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { TelegramWebApp } from '@/lib/types';

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const SRC = 'https://telegram.org/js/telegram-web-app.js?63';
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  delete window.Telegram;
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); await vi.advanceTimersByTimeAsync(15_000); });
  document.querySelectorAll(`script[src="${SRC}"]`).forEach(script => script.remove());
  container.remove();
  delete window.Telegram;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('does not request the native Telegram SDK for ordinary browser visitors', async () => {
  const { TelegramSdk } = await import('./telegram-sdk');
  await act(async () => root.render(createElement(TelegramSdk)));
  expect(document.querySelector(`script[src="${SRC}"]`)).toBeNull();
});

it('shares one nonblocking download across Strict Mode and announces late readiness', async () => {
  window.history.replaceState({}, '', '/#tgWebAppData=signed');
  const { TelegramSdk } = await import('./telegram-sdk');
  const { getTelegramSdkStatus, loadTelegramSdk } = await import('@/lib/telegram-sdk');
  await act(async () => root.render(createElement(StrictMode, null, createElement(TelegramSdk))));
  const scripts = document.querySelectorAll<HTMLScriptElement>(`script[src="${SRC}"]`);
  expect(scripts).toHaveLength(1);
  expect(scripts[0].async).toBe(true);
  expect(getTelegramSdkStatus()).toBe('loading');
  await act(async () => {
    window.Telegram = { WebApp: { initData: 'signed' } as TelegramWebApp };
    scripts[0].dispatchEvent(new Event('load'));
    await loadTelegramSdk();
  });
  expect(getTelegramSdkStatus()).toBe('ready');
});

it('restores the native SDK on the next document after login removes the launch hash', async () => {
  window.history.replaceState({}, '', '/#tgWebAppData=signed');
  const first = await import('./telegram-sdk');
  await act(async () => root.render(createElement(first.TelegramSdk)));
  await act(async () => {
    window.Telegram = { WebApp: { initData: 'signed' } as TelegramWebApp };
    document.querySelector(`script[src="${SRC}"]`)!.dispatchEvent(new Event('load'));
  });
  await act(async () => root.unmount());
  // Fresh document in the same tab: only sessionStorage survives the redirect.
  delete window.Telegram;
  document.querySelector(`script[src="${SRC}"]`)!.remove();
  window.history.replaceState({}, '', '/marketplace');
  vi.resetModules();
  root = createRoot(container);
  const second = await import('./telegram-sdk');
  await act(async () => root.render(createElement(second.TelegramSdk)));
  expect(document.querySelector(`script[src="${SRC}"]`)).not.toBeNull();
});

it.each(['error', 'timeout'] as const)('releases signed-hash authentication after SDK %s', async mode => {
  window.history.replaceState({}, '', '/#tgWebAppData=signed');
  const { TelegramSdk } = await import('./telegram-sdk');
  const { getTelegramSdkStatus } = await import('@/lib/telegram-sdk');
  await act(async () => root.render(createElement(TelegramSdk)));
  await act(async () => {
    if (mode === 'error') document.querySelector(`script[src="${SRC}"]`)!.dispatchEvent(new Event('error'));
    else await vi.advanceTimersByTimeAsync(15_000);
  });
  expect(getTelegramSdkStatus()).toBe('failed');
  expect(window.location.hash).toBe('#tgWebAppData=signed');
  expect(document.querySelector(`script[src="${SRC}"]`)).toBeNull();
});

it.each(['load', 'error', 'timeout'] as const)('preserves the launch hash until SDK %s, then continues verified-session login', async mode => {
  const signed = new URLSearchParams({ user: JSON.stringify({ id: 123 }), auth_date: '123', hash: 'test' }).toString();
  window.history.replaceState({}, '', `/#tgWebAppData=${encodeURIComponent(signed)}`);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ telegramId: 123 }))));
  const { TelegramSdk } = await import('./telegram-sdk');
  const { TelegramWebAppAutoLogin } = await import('@/components/auth/telegram-webapp-auto-login');
  await act(async () => root.render(createElement('div', null,
    createElement(TelegramSdk), createElement(TelegramWebAppAutoLogin))));
  expect(fetch).not.toHaveBeenCalled();
  expect(window.location.hash).toContain('tgWebAppData');
  await act(async () => {
    if (mode === 'load') window.Telegram = { WebApp: { initData: signed } as TelegramWebApp };
    if (mode === 'timeout') await vi.advanceTimersByTimeAsync(15_000);
    else document.querySelector(`script[src="${SRC}"]`)!.dispatchEvent(new Event(mode));
  });
  expect(fetch).toHaveBeenCalledWith('/api/telegram-webapp', expect.any(Object));
  expect(window.location.hash).toBe('');
  expect(router.replace).toHaveBeenCalledWith('/marketplace');
});
