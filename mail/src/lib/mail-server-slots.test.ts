import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('./api', () => ({ apiFetch: mocks.apiFetch, ApiException: class extends Error {} }));
import { getMailboxSlots } from './mail-server';
beforeEach(() => vi.clearAllMocks());
describe('getMailboxSlots', () => {
  it('uses the shared quota endpoint rather than counting sidebar rows', async () => {
    const slots = { totalUsed: 10, totalLimit: 10, customUsed: 2, customLimit: 2, used: 10, limit: 10, full: true, plan: 'PRO', lockedCount: 0, exemptUsed: 0, resourceUsed: 10 };
    mocks.apiFetch.mockResolvedValue(slots);
    expect(await getMailboxSlots()).toEqual(slots);
    expect(mocks.apiFetch).toHaveBeenCalledWith('/trade/v1/mailboxes/slots');
  });
  it('preserves unknown capacity after a projection or network failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.apiFetch.mockRejectedValue(new Error('plan_projection_unavailable'));
    expect(await getMailboxSlots()).toBeNull();
    vi.restoreAllMocks();
  });
});

 it('keeps legacy random-only counters unknown during rollout', async () => {
   mocks.apiFetch.mockResolvedValue({ used: 5, limit: 5, full: true, plan: 'PRO', lockedCount: 0 });
   expect(await getMailboxSlots()).toBeNull();
 });
 it('rejects missing custom counters rather than rendering undefined', async () => {
   mocks.apiFetch.mockResolvedValue({ used: 10, limit: 10, totalUsed: 10, totalLimit: 10, full: true, plan: 'PRO', lockedCount: 0 });
   expect(await getMailboxSlots()).toBeNull();
 });
