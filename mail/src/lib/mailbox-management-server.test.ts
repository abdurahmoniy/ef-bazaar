import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const fetcher = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ apiFetch: fetcher }));
import { getMailboxManagementData } from './mailbox-management-server';
afterEach(() => vi.clearAllMocks());
it('uses only active account addresses to classify mailboxes and preserves owned metadata', async () => {
 const boxes = [{ id: 'owned', email: 'own@efbazaar.uz', activeTrade: true }];
 fetcher.mockImplementation(async (path: string) => path.includes('marketplace') ? [{ email: 'active@efbazaar.uz', status: 'ACTIVE' }, { email: 'archived@efbazaar.uz', status: 'ARCHIVED' }, { email: null, status: 'ACTIVE' }] : boxes);
 expect(await getMailboxManagementData()).toEqual({ boxes, accountEmails: ['active@efbazaar.uz'] });
 expect(fetcher).toHaveBeenCalledWith('/trade/v1/mailboxes');
 expect(fetcher).toHaveBeenCalledWith('/marketplace/v1/accounts');
});
it('distinguishes unavailable data from a successful empty list', async () => {
 fetcher.mockRejectedValue(new Error('upstream unavailable'));
 expect(await getMailboxManagementData()).toEqual({ boxes: null, accountEmails: null });
 fetcher.mockResolvedValue([]);
 expect(await getMailboxManagementData()).toEqual({ boxes: [], accountEmails: [] });
});
