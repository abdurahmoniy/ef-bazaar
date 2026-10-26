import { expect, it, vi, afterEach } from 'vitest';
import { resourceUsage, canReleaseMailbox, fetchMailboxResources, releaseMailbox } from './mailbox-resources';
afterEach(() => vi.unstubAllGlobals());
it('warns at actual quota 80% and never renders failed measurements as zero', () => {
  expect(resourceUsage({ usageBytes: 80, quotaBytes: 100, usageStatus: 'FRESH' })).toMatchObject({ percent: 80, warning: true });
  expect(resourceUsage({ usageBytes: null, quotaBytes: null, usageStatus: 'ERROR' })).toEqual({ percent: null, warning: false, label: 'O‘lchashda xato' });
  expect(resourceUsage({ usageBytes: 90, quotaBytes: 100, usageStatus: 'STALE' }).label).toContain('eskirgan');
});
it('requires fresh backend proof before releasing and blocks holds or active trades', () => {
  const proof = { requestId: 'proof', status: 'VERIFIED' as const, expiresAt: '2026-10-20T00:00:00Z' };
  const now = new Date('2026-10-19T00:00:00Z');
  expect(canReleaseMailbox({ activeTrade: false, legalHold: false }, proof, now)).toBe(true);
  expect(canReleaseMailbox({ activeTrade: true, legalHold: false }, proof, now)).toBe(false);
  expect(canReleaseMailbox({ activeTrade: false, legalHold: true }, proof, now)).toBe(false);
  expect(canReleaseMailbox({}, { ...proof, status: 'PENDING' }, now)).toBe(false);
  expect(canReleaseMailbox({}, proof, new Date('2026-10-21T00:00:00Z'))).toBe(false);
});
it('does not treat failed resource API as an empty list and sends explicit release confirmation', async () => {
  const mock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Mailcow unavailable' }), { status: 503 })).mockResolvedValueOnce(Response.json({ status: 'PENDING' }));
  vi.stubGlobal('fetch', mock);
  await expect(fetchMailboxResources()).rejects.toThrow('Mailcow unavailable');
  await releaseMailbox('mail/1', 'proof');
  expect(mock.mock.calls[1]).toEqual(['/api/trade/v1/mailboxes/mail%2F1/release', expect.objectContaining({ method: 'POST', body: JSON.stringify({ requestId: 'proof', confirmDelete: true }) })]);
});
it('blocks repeated release while physical deletion is pending or confirmed', () => {
  const proof = { requestId: 'p', status: 'VERIFIED' as const, expiresAt: '2099-01-01T00:00:00Z' };
  expect(canReleaseMailbox({ activeTrade: false, legalHold: false, deletionStatus: 'PENDING' }, proof)).toBe(false);
  expect(canReleaseMailbox({ activeTrade: false, legalHold: false, deletionStatus: 'CONFIRMED' }, proof)).toBe(false);
});
it('recognizes an observed zero Mailcow quota as unlimited without a fake percentage', () => {
  expect(resourceUsage({ usageBytes: 2048, quotaBytes: 0, usageStatus: 'FRESH' })).toEqual({ percent: null, warning: false, label: 'Yangi o‘lchov' });
});
it('does not round a below-80-percent mailbox into the warning threshold', () => {
  expect(resourceUsage({ usageBytes: 799, quotaBytes: 1000, usageStatus: 'FRESH' })).toMatchObject({ percent: 79, warning: false });
});
it('rejects a verified release when provisioning is still unresolved', () => {
  expect(canReleaseMailbox({ activeTrade: false, legalHold: false, deletionStatus: 'NONE', provisioningStatus: 'STARTED' }, { requestId: 'p', status: 'VERIFIED', expiresAt: '2099-01-01T00:00:00Z' })).toBe(false);
});
