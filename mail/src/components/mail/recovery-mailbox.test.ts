import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ boxes: vi.fn(), inbox: vi.fn(), message: vi.fn(), slots: vi.fn() }));
vi.mock('@/lib/mail-server', () => ({ getMyMailboxes: mocks.boxes, getInbox: mocks.inbox, getMessage: mocks.message, getMailboxSlots: mocks.slots, MailboxLockedError: class extends Error {} }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notfound'); }, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/components/mail/mailbox-unlink', () => ({ MailboxUnlink: () => null }));
vi.mock('@/components/mail/mailbox-title', () => ({ MailboxTitle: () => null }));
vi.mock('@/components/mail/refresh-controls', () => ({ RefreshControls: () => null }));
vi.mock('@/components/mail/inbox-view', () => ({ InboxView: () => null }));
import InboxPage from '@/app/[mailboxId]/page';
it('reads the server-filtered Recovery inbox even when legacy locked is true', async () => {
  mocks.boxes.mockResolvedValue([{ id: 'recovery', email: 'box@efbazaar.uz', accessState: 'RECOVERY', locked: true, graceEndsAt: '2026-10-31T00:00:00Z' }]);
  mocks.inbox.mockResolvedValue({ messages: [], total: 0 });
  mocks.slots.mockResolvedValue({ plan: 'STANDARD' });
  const html = renderToStaticMarkup(await InboxPage({ params: Promise.resolve({ mailboxId: 'recovery' }) }));
  expect(mocks.inbox).toHaveBeenCalledWith('recovery', { limit: 50, offset: 0 });
  expect(html).toContain('Recovery');
  expect(html).toContain('Konami');
});
