import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveMailboxName } from './mailbox-name';

afterEach(() => vi.unstubAllGlobals());

describe('saveMailboxName', () => {
  it('saves a trimmed name through the authenticated same-origin proxy', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await saveMailboxName('mailbox-1', '  Main account  ');
    expect(fetchMock).toHaveBeenCalledWith('/api/trade/v1/mailboxes/mailbox-1/name', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Main account' }),
    });
  });

  it('sends an empty name to clear the label', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await saveMailboxName('mailbox-1', '   ');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ displayName: '' });
  });

  it('does not submit an overlong name', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(saveMailboxName('mailbox-1', 'x'.repeat(61))).rejects.toThrow('60');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports session expiry without claiming a save', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    await expect(saveMailboxName('mailbox-1', 'Main')).rejects.toThrow('qayta kiring');
  });

  it('reports a rejected save without displaying an upstream HTML error page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>upstream error</html>', { status: 502 })));
    await expect(saveMailboxName('mailbox-1', 'Main')).rejects.toThrow('saqlanmadi');
  });

  it('does not mistake a successful HTML login response for a saved name', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>login</html>', { status: 200 })));
    await expect(saveMailboxName('mailbox-1', 'Main')).rejects.toThrow('saqlanmadi');
  });

  it('reports a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(saveMailboxName('mailbox-1', 'Main')).rejects.toThrow('ulanib');
  });
});
