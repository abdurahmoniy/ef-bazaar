// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PushPermissionPrompt } from './push-permission-prompt';
import type { PushState } from '@/lib/firebase-push';

let root: Root;
let container: HTMLDivElement;
const enable = vi.fn();
async function render(state: PushState = 'available', userId: string | null = 'user-a') {
  await act(async () => root.render(createElement(PushPermissionPrompt, { state, userId, busy: false, enable })));
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear(); enable.mockReset();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('authenticated push invitation', () => {
  it('invites authenticated users and starts permission only on their click', async () => {
    await render();
    expect(container.textContent).toContain('Bildirishnomalarni yoqing');
    expect(enable).not.toHaveBeenCalled();
    await act(async () => container.querySelector<HTMLButtonElement>('[data-enable-push]')!.click());
    expect(enable).toHaveBeenCalledOnce();
  });
  it.each(['loading', 'enabled', 'denied', 'unconfigured', 'error'] as PushState[])('does not invite users in %s state', async state => {
    await render(state); expect(container.textContent).toBe('');
  });
  it('never prompts visitors who are not signed in', async () => {
    await render('available', null); expect(container.textContent).toBe('');
  });
  it('remembers dismissal across remounts but invites another account', async () => {
    await render();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Taklifni yopish"]')!.click());
    expect(container.textContent).toBe('');
    await act(async () => root.unmount()); root = createRoot(container);
    await render(); expect(container.textContent).toBe('');
    await render('available', 'user-b'); expect(container.textContent).toContain('Bildirishnomalarni yoqing');
  });
  it('shows installation guidance without an unusable permission button', async () => {
    await render('install');
    expect(container.textContent).toContain('Bosh ekranga qo‘shish');
    expect(container.querySelector('[data-enable-push]')).toBeNull();
  });
  it('still invites an installed app after dismissing installation guidance', async () => {
    await render('install');
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Taklifni yopish"]')!.click());
    await render('available'); expect(container.querySelector('[data-enable-push]')).not.toBeNull();
  });
  it('keeps a failed enable attempt visible with a route to settings', async () => {
    await render();
    await act(async () => container.querySelector<HTMLButtonElement>('[data-enable-push]')!.click());
    await render('error'); expect(container.textContent).toContain('Ulanib bo‘lmadi');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/notifications');
  });
});
