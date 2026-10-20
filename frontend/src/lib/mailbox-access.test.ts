import { describe, expect, it } from 'vitest';
import { mailboxAccess, accessDescription } from './mailbox-access';
describe('mailbox access transitions', () => {
  it('honours explicit recovery and grace even with an old locked flag', () => {
    expect(mailboxAccess({ accessState: 'RECOVERY', locked: false })).toBe('RECOVERY');
    expect(mailboxAccess({ accessState: 'GRACE', locked: true })).toBe('GRACE');
    expect(mailboxAccess({ locked: true })).toBe('LOCKED');
  });
  it('shows the real paid/grace dates and limited recovery access', () => {
    const text = accessDescription({ accessState: 'GRACE', paidExpiresAt: '2026-10-01T00:00:00Z', graceEndsAt: '2026-10-31T00:00:00Z' });
    expect(text).toContain('01.10.2026');
    expect(text).toContain('31.10.2026');
    expect(accessDescription({ accessState: 'RECOVERY' })).toContain('Konami');
  });
});
