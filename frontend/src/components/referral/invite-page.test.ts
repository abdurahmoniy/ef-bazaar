import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';

const { getMe, redirect } = vi.hoisted(() => ({
  getMe: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }),
}));
vi.mock('@/lib/auth', () => ({ getMe }));
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('@/components/marketplace/marketplace-shell', () => ({ MarketplaceShell: () => createElement('div') }));
vi.mock('@/components/referral/invite-panel', () => ({ InvitePanel: () => createElement('div') }));

import InvitePage, { metadata } from '@/app/invite/page';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';

beforeEach(() => { getMe.mockReset(); redirect.mockClear(); });

describe('InvitePage', () => {
  it('preserves the invite destination through login', async () => {
    getMe.mockResolvedValue(null);
    await expect(InvitePage()).rejects.toThrow('REDIRECT:/auth/login?from=/invite');
  });

  it('uses the familiar shell with a back route for signed-in users', async () => {
    const user = { id: 'user-1', verified: true };
    getMe.mockResolvedValue(user);
    const page = await InvitePage();
    expect(page.type).toBe(MarketplaceShell);
    expect(page.props).toMatchObject({ user, hideSearch: true, backHref: '/profile' });
    expect(metadata).toMatchObject({ title: 'Do‘st taklif qilish', robots: { index: false, follow: false } });
  });
});
