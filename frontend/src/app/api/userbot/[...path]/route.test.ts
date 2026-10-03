import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

afterEach(() => vi.unstubAllGlobals());

function call(path: string[]) {
  return GET(new NextRequest(`http://localhost/api/userbot/${path.join('/')}`), {
    params: Promise.resolve({ path }),
  });
}

describe('userbot proxy', () => {
  it('forwards to internal nginx under /userbot/', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await call(['v1', 'accounts']);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/userbot\/v1\/accounts$/);
  });

  it.each([[['v1', '..', 'admin']], [['.', 'x']], [[]]])('rejects path %j', async (path) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await call(path);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
