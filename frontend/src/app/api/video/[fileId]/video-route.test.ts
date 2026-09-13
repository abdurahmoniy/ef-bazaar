import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

describe('/api/video/[fileId] route', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('bo\'sh fileId bo\'lsa 400 beradi', async () => {
    const request = new NextRequest('http://localhost:3000/api/video/%20');
    const response = await GET(request, { params: Promise.resolve({ fileId: '   ' }) });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('file_id_required');
  });

  it('/bot/video muvaffaqiyatli bo\'lsa video/mp4 va inline bilan qaytaradi', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          'content-length': '3',
        },
      }),
    );

    const request = new NextRequest('http://localhost:3000/api/video/test-file');
    const response = await GET(request, { params: Promise.resolve({ fileId: 'test-file' }) });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(response.headers.get('content-disposition')).toBe('inline');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
  });

  it('/bot/video 404 bersa /bot/file fallback ga o\'tadi', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('Not found', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([4, 5, 6]), {
          status: 200,
          headers: { 'content-length': '3' },
        }),
      );

    globalThis.fetch = fetchMock;

    const request = new NextRequest('http://localhost:3000/api/video/fallback-file');
    const response = await GET(request, { params: Promise.resolve({ fileId: 'fallback-file' }) });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/bot/video/fallback-file');
    expect(fetchMock.mock.calls[1][0]).toContain('/bot/file/fallback-file');
  });
});
