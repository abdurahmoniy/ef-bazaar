// @vitest-environment jsdom

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getMe, redirect } = vi.hoisted(() => ({
  getMe: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }),
}));
vi.mock('@/lib/auth', () => ({ getMe }));
vi.mock('next/navigation', () => ({ redirect, useRouter: () => ({ back: vi.fn(), push: vi.fn() }), usePathname: () => '/auth/login' }));

import AuthLayout from '../layout';
import LoginPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
  getMe.mockResolvedValue(null);
  vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'google-client');
});
afterEach(() => { vi.unstubAllEnvs(); document.body.innerHTML = ''; });

describe('login page', () => {
  it('provides one main heading, a theme control, and routes for browsing and help', async () => {
    document.body.innerHTML = renderToStaticMarkup(createElement(AuthLayout, null, await LoginPage({})));
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(document.querySelector('h1')?.textContent).toBe('efBazaar’ga kirish');
    expect(document.querySelector('main section')?.querySelector('h1')).not.toBeNull();
    expect(document.querySelector('header button[aria-label="Qorong‘i rejim"]')).not.toBeNull();
    expect(document.querySelector('header a[aria-label="eFBazaar bosh sahifa"]')).not.toBeNull();
    expect(document.querySelector('a[href="/marketplace"]')).not.toBeNull();
    expect(document.querySelector('a[href="/help"]')).not.toBeNull();
    const skip = document.querySelector<HTMLAnchorElement>('a[href="#auth-main"]');
    expect(skip).not.toBeNull();
    expect(document.querySelector(skip!.hash)?.getAttribute('tabindex')).toBe('-1');
  });

  it('describes only available providers and automatic first-time registration', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', '');
    document.body.innerHTML = renderToStaticMarkup(await LoginPage({}));
    expect(document.body.textContent).not.toContain('Google');
    expect(document.body.textContent).toContain('profil avtomatik yaratiladi');
  });

  it('keeps the existing redirect for an already signed-in visitor', async () => {
    getMe.mockResolvedValue({ id: 'existing-user' });
    await expect(LoginPage({ searchParams: Promise.resolve({ from: '/marketplace/new' }) })).rejects.toThrow('redirect:/marketplace/new');
    expect(redirect).toHaveBeenCalledWith('/marketplace/new');
  });
});
