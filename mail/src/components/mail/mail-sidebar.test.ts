import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MailSidebar } from './mail-sidebar';
import type { MailboxSummary } from '@/lib/mail-types';

const mailbox: MailboxSummary = {
  id: 'mailbox-1', email: 'account@efbazaar.uz', unreadCount: 2,
  lastActivityAt: null, ownedSince: '2026-09-19T00:00:00Z', locked: false,
};

describe('mailbox names in the sidebar', () => {
  it('shows a saved name before the email while keeping the mailbox link and unread count', () => {
    const html = renderToStaticMarkup(createElement(MailSidebar, {
      mailboxes: [{ ...mailbox, displayName: 'Main account' }], activeMailboxId: mailbox.id,
    }));
    expect(html).toContain('Main account');
    expect(html.indexOf('Main account')).toBeLessThan(html.indexOf('account@efbazaar.uz</span>'));
    expect(html).toContain('href="/mailbox-1"');
    expect(html).toContain('2 yangi xat');
  });

  it('keeps the email title when the backend has no name field yet', () => {
    const html = renderToStaticMarkup(createElement(MailSidebar, {
      mailboxes: [mailbox], activeMailboxId: null,
    }));
    expect(html).toContain('account@efbazaar.uz');
    expect(html).not.toContain('undefined');
  });

  it('escapes user-provided names and uses them in the mobile sidebar too', () => {
    const html = renderToStaticMarkup(createElement(MailSidebar, {
      mailboxes: [{ ...mailbox, displayName: '<script>alert(1)</script>' }],
      activeMailboxId: mailbox.id, hideHeader: true,
    }));
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('account@efbazaar.uz');
  });
});

 describe('shared mailbox capacity', () => {
   it('shows authoritative total/custom allocation, with gifts counted separately', () => {
     const html = renderToStaticMarkup(createElement(MailSidebar, { mailboxes: [mailbox], activeMailboxId: null, slots: { used: 10, limit: 10, totalUsed: 10, totalLimit: 10, customUsed: 2, customLimit: 2, exemptUsed: 1, resourceUsed: 11, full: true, plan: 'PRO', lockedCount: 0 } }));
     expect(html).toContain('Jami: 10 / 10');
     expect(html).toContain('shundan custom: 2 / 2');
     expect(html).toContain('Limitdan tashqari qutilar: 1');
     expect(html).toContain('Resursda: 11');
     expect(html).toContain('Custom chegarasi yangi nomli quti yaratish uchun');
   });
   it('does not invent an unlimited or zero allowance when the request fails', () => {
     const html = renderToStaticMarkup(createElement(MailSidebar, { mailboxes: [mailbox], activeMailboxId: null, slots: null }));
     expect(html).toContain('Pochta limiti aniqlanmadi');
     expect(html).not.toContain('cheksiz');
   });
   it('keeps staff quota hidden', () => {
     const html = renderToStaticMarkup(createElement(MailSidebar, { mailboxes: [mailbox], activeMailboxId: null, slots: { used: 10, limit: null, totalUsed: 10, totalLimit: null, customUsed: 2, customLimit: null, exemptUsed: 0, resourceUsed: 10, full: false, plan: 'STAFF', lockedCount: 0 } }));
     expect(html).not.toContain('Jami:');
   });
 });
