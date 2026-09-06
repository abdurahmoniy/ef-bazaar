import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { getMe } = vi.hoisted(() => ({ getMe: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getMe }));
vi.mock('@/components/marketplace/marketplace-shell', () => ({ MarketplaceShell: () => createElement('div') }));
vi.mock('@/components/partners/partnership-flow', () => ({ PartnershipFlow: () => createElement('div') }));
import PartnershipPage from '@/app/partnership/page';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
beforeEach(() => { getMe.mockReset(); });
describe('PartnershipPage', () => {
  it('passes the actual server Telegram linking state for a Google-only user', async () => {
    const user = { id: '1', telegramLinked: false }; getMe.mockResolvedValue(user);
    const page = await PartnershipPage();
    expect(page.type).toBe(MarketplaceShell);
    expect(page.props.children.props).toMatchObject({ authenticated: true, telegramLinked: false });
  });
  it('fails open to the public benefits when optional authentication fails', async () => {
    getMe.mockRejectedValue(new Error('Auth unavailable'));
    const page = await PartnershipPage();
    expect(page.props.user).toBeNull();
    expect(page.props.children.props).toMatchObject({ authenticated: false, telegramLinked: false });
  });
});
