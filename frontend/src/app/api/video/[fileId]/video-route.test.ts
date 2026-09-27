import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, HEAD } from './route';

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
          'accept-ranges': 'bytes',
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

  it('preserves the actual video format and partial response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([7, 8]), {
      status: 206,
      headers: {
        'content-type': 'video/webm',
        'content-range': 'bytes 4-5/6',
        'content-length': '2',
        'accept-ranges': 'bytes',
      },
    }));
    globalThis.fetch = fetchMock;
    const response = await GET(new NextRequest('http://localhost/api/video/guide', {
      headers: { range: 'bytes=4-5' },
    }), { params: Promise.resolve({ fileId: 'guide' }) });

    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('range')).toBe('bytes=4-5');
    expect(response.status).toBe(206);
    expect(response.headers.get('content-type')).toBe('video/webm');
    expect(response.headers.get('content-range')).toBe('bytes 4-5/6');
    expect(response.headers.get('content-length')).toBe('2');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([7, 8]);
  });

  it('preserves the multipart boundary for multiple byte ranges', async () => {
    const contentType = 'multipart/byteranges; boundary=video-boundary';
    const body = '--video-boundary\r\nContent-Type: video/mp4\r\nContent-Range: bytes 0-1/6\r\n\r\nab\r\n--video-boundary\r\nContent-Type: video/mp4\r\nContent-Range: bytes 4-5/6\r\n\r\nef\r\n--video-boundary--';
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, {
      status: 206,
      headers: { 'content-type': contentType, 'accept-ranges': 'bytes' },
    }));
    globalThis.fetch = fetchMock;
    const response = await GET(new NextRequest('http://localhost/api/video/guide', {
      headers: { range: 'bytes=0-1,4-5' },
    }), { params: Promise.resolve({ fileId: 'guide' }) });

    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('range')).toBe('bytes=0-1,4-5');
    expect(response.status).toBe(206);
    expect(response.headers.get('content-type')).toBe(contentType);
    expect(await response.text()).toBe(body);
  });

  it('preserves the unsatisfiable range response for the browser', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, {
      status: 416,
      headers: { 'content-range': 'bytes */6', 'accept-ranges': 'bytes' },
    }));
    const response = await GET(new NextRequest('http://localhost/api/video/guide', {
      headers: { range: 'bytes=9-' },
    }), { params: Promise.resolve({ fileId: 'guide' }) });

    expect(response.status).toBe(416);
    expect(response.headers.get('content-range')).toBe('bytes */6');
    expect(response.headers.get('cache-control')).not.toContain('public');
  });

  it('does not advertise byte ranges when the legacy upstream cannot serve them', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([1]), {
      headers: { 'content-type': 'video/mp4' },
    }));
    const response = await GET(new NextRequest('http://localhost/api/video/guide'), {
      params: Promise.resolve({ fileId: 'guide' }),
    });
    expect(response.headers.get('accept-ranges')).toBeNull();
  });

  it('HEAD preserves video metadata without a response body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, {
      headers: { 'content-type': 'video/webm', 'content-length': '6' },
    }));
    globalThis.fetch = fetchMock;
    const response = await HEAD(new NextRequest('http://localhost/api/video/guide', {
      method: 'HEAD',
    }), { params: Promise.resolve({ fileId: 'guide' }) });
    expect(fetchMock.mock.calls[0][1].method).toBe('HEAD');
    expect(response.headers.get('content-type')).toBe('video/webm');
    expect(response.headers.get('content-length')).toBe('6');
    expect(response.body).toBeNull();
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
