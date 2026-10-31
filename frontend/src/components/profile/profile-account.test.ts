// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { expect, it, vi } from 'vitest';
import config from '../../../tailwind.config';
import type { User } from '@/lib/types';

vi.mock('@/hooks/use-partner-status', () => ({ usePartnerDetails: () => ({ partner: false, application: null }) }));
vi.mock('@/components/theme/use-theme', () => ({ useTheme: () => ({ mounted: false, isDark: false, toggle: vi.fn() }) }));
vi.mock('@/app/auth/actions', () => ({ logoutAction: vi.fn() }));
vi.mock('./profile-membership', () => ({ ProfileMembership: () => null }));
vi.mock('./profile-appearance', () => ({ ProfileAppearance: () => null }));
vi.mock('./delete-account-button', () => ({ DeleteAccountButton: () => null }));
vi.mock('./google-link-button', () => ({ GoogleLinkButton: () => null }));
vi.mock('./link-telegram-button', () => ({ LinkTelegramButton: () => null }));
vi.mock('./trade-admin-application-panel', () => ({ TradeAdminApplicationPanel: () => null }));
vi.mock('@/components/growth/invitation-card', () => ({ InvitationCard: () => null }));
vi.mock('@/components/growth/channel-owner-card', () => ({ ChannelOwnerCard: () => null }));
vi.mock('./mailbox-slots-warning', () => ({ MailboxSlotsWarning: () => createElement('div', null, 'Detailed mailbox management') }));
vi.mock('./mailbox-summary-card', () => ({ MailboxSummaryCard: () => createElement('div', null, 'Compact mailbox summary') }));

import { ProfileAccount } from './profile-account';

it('places only the compact mailbox summary beside profile identity settings', () => {
  const user: User = { id: 'viewer', displayName: 'Test', roles: [], googleLinked: true, telegramLinked: true, verified: true, createdAt: '2026-01-01T00:00:00Z' };
  const html = renderToStaticMarkup(createElement(ProfileAccount, { user, googleClientId: '', botUsername: '', tradeAdminApplication: null }));
  expect(html).toContain('Compact mailbox summary');
  expect(html).not.toContain('Detailed mailbox management');
  expect(html).toContain('Akkount tasdiqlash');
});

it('keeps the mobile navigation column shrinkable so trailing controls fit inside the card', async () => {
  const user: User = { id: 'viewer', displayName: 'Test', roles: [], googleLinked: true, telegramLinked: true, verified: true, createdAt: '2026-01-01T00:00:00Z' };
  const html = renderToStaticMarkup(createElement(ProfileAccount, { user, googleClientId: '', botUsername: '', tradeAdminApplication: null }));
  const { css } = await postcss([tailwindcss({ ...config, content: [{ raw: html }] })])
    .process(readFileSync('src/app/globals.css', 'utf8'), { from: undefined });
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
  document.body.innerHTML = html;
  try {
    const navigation = document.querySelector('[aria-label="Profil bo‘limlari"]')!;
    expect(getComputedStyle(navigation).gridTemplateColumns).toBe('repeat(1, minmax(0, 1fr))');
  } finally {
    style.remove();
    document.body.innerHTML = '';
  }
});
