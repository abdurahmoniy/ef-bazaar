import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MAIN_SITE_URL } from '@/lib/site';
import type { MailboxSummary } from '@/lib/mail-types';
import { FAKE_ROWS, LockedMailbox, swapUrl, upgradeUrl } from './locked-mailbox';
import { MailSidebar } from './mail-sidebar';

const locked: MailboxSummary = {
  id: 'abc', email: 'nodir@efbazaar.uz', unreadCount: null, lastActivityAt: null,
  ownedSince: '2026-09-19T00:00:00Z', locked: true,
};

describe('locked mailbox', () => {
  it('sends the upgrade to the main site plans page', () => {
    expect(upgradeUrl()).toBe(`${MAIN_SITE_URL}/plans`);
  });

  it('sends the swap to the profile mailbox section', () => {
    expect(swapUrl('abc')).toBe(`${MAIN_SITE_URL}/profile?mailbox=abc#mailboxes`);
  });

  it('blurs placeholder rows, never real mail', () => {
    expect(FAKE_ROWS.length).toBeGreaterThan(4);
    expect(FAKE_ROWS.every((r) => !r.includes('@'))).toBe(true);
  });

  it('renders the locked panel with both main-site links', () => {
    const html = renderToStaticMarkup(createElement(LockedMailbox, { mailbox: locked, plan: 'STANDARD' }));
    expect(html).toContain('Bu quti qulflangan');
    expect(html).toContain(`href="${MAIN_SITE_URL}/plans"`);
    expect(html).toContain('Tarifni oshirish');
    expect(html).toContain('Boshqa qutini qulflab, shuni ochish');
    expect(html).toContain('mailbox=abc#mailboxes');
  });

  it('shows a lock instead of an unread badge in the sidebar', () => {
    const html = renderToStaticMarkup(createElement(MailSidebar, {
      mailboxes: [locked], activeMailboxId: null,
    }));
    expect(html).toContain('aria-label="Qulflangan"');
    expect(html).toContain('href="/abc"');
    expect(html).not.toContain('yangi xat');
  });
});

 it.each(['PRO', 'MAX', 'STAFF', null])('offers shared access selection without a nonexistent upgrade for %s', plan => {
   const html = renderToStaticMarkup(createElement(LockedMailbox, { mailbox: locked, plan }));
   expect(html).not.toContain(`href="${MAIN_SITE_URL}/plans"`);
   expect(html).not.toContain('Tarifni oshirish');
   expect(html).toContain('mailbox=abc#mailboxes');
   expect(html).toContain('Boshqa qutini qulflab, shuni ochish');
   expect(html).toContain('umumiy o‘qish limitidan tashqarida');
 });
