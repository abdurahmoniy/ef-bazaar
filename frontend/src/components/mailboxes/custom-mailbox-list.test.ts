import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CustomMailbox } from '@/lib/custom-mailbox';
import { CustomMailboxList } from './custom-mailbox-list';

const box: CustomMailbox = {
  id: 'custom-1', email: 'alibek1@efbazaar.uz', provisioned: true, locked: true,
  linkedAccountId: null, activeSessionId: null, createdAt: '2026-10-01T00:00:00Z',
};

describe('custom mailbox access selection', () => {
  it('routes a locked existing custom inbox to the unified access picker', () => {
    const html = renderToStaticMarkup(createElement(CustomMailboxList, { boxes: [box] }));
    expect(html).toContain('href="/profile?mailbox=custom-1#mailboxes"');
    expect(html).toContain('O‘qish uchun tanlash');
    expect(html).not.toContain('href="/plans"');
    expect(html).not.toContain('/custom-1/link');
  });

  it('still links an open unassigned custom inbox to a Konami account', () => {
    const html = renderToStaticMarkup(createElement(CustomMailboxList, { boxes: [{ ...box, locked: false }] }));
    expect(html).toContain('href="/mailboxes/custom/custom-1/link"');
    expect(html).toContain('Akkount ulash');
  });
});

it('labels explicit Recovery and opens the filtered inbox instead of treating it as an opaque lock', () => {
  const html = renderToStaticMarkup(createElement(CustomMailboxList, { boxes: [{ ...box, locked: false, accessState: 'RECOVERY', paidExpiresAt: '2026-10-01T00:00:00Z', graceEndsAt: '2026-10-31T00:00:00Z' } as CustomMailbox] }));
  expect(html).toContain('Recovery');
  expect(html).toContain('Konami');
  expect(html).toContain('01.10.2026');
  expect(html).not.toContain('/custom-1/link');
  expect(html).toContain('Free uchun tanlash');
});
