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
