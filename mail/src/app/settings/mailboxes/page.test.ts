import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ me: vi.fn(), boxes: vi.fn(), slots: vi.fn(), management: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getMe: mocks.me }));
vi.mock('@/lib/mail-server', () => ({ getMyMailboxes: mocks.boxes, getMailboxSlots: mocks.slots }));
vi.mock('@/lib/mailbox-management-server', () => ({ getMailboxManagementData: mocks.management }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error('redirect:' + url); } }));
vi.mock('@/components/mail/mail-shell', () => ({ MailShell: () => null }));
vi.mock('@/components/mail/mailbox-management', () => ({ MailboxManagement: () => null }));
import Page from './page';
beforeEach(() => { vi.clearAllMocks(); mocks.me.mockResolvedValue({ id: 'A' }); mocks.boxes.mockResolvedValue([]); mocks.slots.mockResolvedValue(null); mocks.management.mockResolvedValue({ boxes: [], accountEmails: null }); });
it('authenticates before fetching mailbox management data and preserves its login destination', async () => {
 mocks.me.mockResolvedValue(null);
 await expect(Page({ searchParams: Promise.resolve({ mailbox: 'locked' }) })).rejects.toThrow(encodeURIComponent('/mail/settings/mailboxes?mailbox=locked'));
 expect(mocks.management).not.toHaveBeenCalled();
});
it('keys private management state by the authenticated user and preserves the selected mailbox', async () => {
 const page = await Page({ searchParams: Promise.resolve({ mailbox: 'locked' }) });
 expect(page.key).toBe('A');
 expect(page.props.children.props.wantedMailboxId).toBe('locked');
 expect(page.props.children.props.accountEmails).toBeNull();
});
