import { afterEach, expect, it, vi } from 'vitest';
import { availableMailboxes, unlockMailbox, type OwnedMailbox } from './mailbox-management';
const box = (extra: Partial<OwnedMailbox> = {}): OwnedMailbox => ({ id: 'free', email: 'free@efbazaar.uz', tradeId: null, locked: false, provisionedAt: '2026-01-01', ...extra });
afterEach(() => vi.unstubAllGlobals());
it('identifies unused mailboxes only when account linkage is known and the box is ready', () => {
 const boxes = [box(), box({ id: 'used', email: 'Used@efbazaar.uz' }), box({ id: 'linked', linkedAccountId: 'account' }), box({ id: 'busy', activeSessionId: 'session' }), box({ id: 'trade', activeTrade: true }), box({ id: 'old-trade', tradeId: 'trade' }), box({ id: 'locked', locked: true }), box({ id: 'unknown', provisionedAt: null }), box({ id: 'recovery', accessState: 'RECOVERY', locked: false })];
 expect(availableMailboxes(boxes, [' used@efbazaar.uz '])?.map(b => b.id)).toEqual(['free']);
 expect(availableMailboxes(boxes, null)).toBeNull();
});
it('sends an explicit access swap and keeps backend failure visible', async () => {
 const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(Response.json({ message: 'Protected trade mailbox' }, { status: 409 }));
 vi.stubGlobal('fetch', fetcher);
 await unlockMailbox('box/1', 'other');
 expect(fetcher).toHaveBeenCalledWith('/api/trade/v1/mailboxes/box%2F1/unlock', expect.objectContaining({ method: 'POST', credentials: 'include', body: JSON.stringify({ lockInsteadId: 'other' }) }));
 await expect(unlockMailbox('box', 'trade')).rejects.toThrow('Protected trade mailbox');
});
