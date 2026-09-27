import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BOT_ORIGIN = (
  process.env.INTERNAL_BOT_BASE_URL ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  'https://efbazaar.uz'
).replace(/\/+$/, '');

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await context.params;
  const normalizedId = fileId?.trim();
  if (!normalizedId) {
    return NextResponse.json({ error: 'file_id_required' }, { status: 400 });
  }

  // Forward range header if requested by browser video player
  const range = request.headers.get('range');
  const headers = new Headers();
  if (range) {
    headers.set('range', range);
  }

  // First try the specialized /bot/video endpoint
  const videoUrl = `${BOT_ORIGIN}/bot/video/${encodeURIComponent(normalizedId)}`;
  let upstreamResponse: Response;

  try {
    upstreamResponse = await fetch(videoUrl, {
      method: request.method,
      headers,
      cache: 'no-store',
    });

    // If 404, fallback to /bot/file (which exists in legacy bot deployment)
    if (upstreamResponse.status === 404) {
      const fileUrl = `${BOT_ORIGIN}/bot/file/${encodeURIComponent(normalizedId)}?name=guide.mp4`;
      upstreamResponse = await fetch(fileUrl, {
        method: request.method,
        headers,
        cache: 'no-store',
      });
    }
  } catch (error) {
    console.error(`[video-proxy] Failed to stream video ${normalizedId}:`, error);
    return NextResponse.json({ error: 'video_fetch_failed' }, { status: 502 });
  }

  if (upstreamResponse.status === 416) {
    const rangeHeaders = new Headers({ 'Cache-Control': 'no-store' });
    const contentRange = upstreamResponse.headers.get('content-range');
    if (contentRange) rangeHeaders.set('Content-Range', contentRange);
    return new NextResponse(null, { status: 416, headers: rangeHeaders });
  }

  if (!upstreamResponse.ok) {
    return NextResponse.json(
      { error: 'upstream_error', status: upstreamResponse.status },
      { status: upstreamResponse.status },
    );
  }

  const responseHeaders = new Headers();
  // Ensure inline video playback headers
  const contentType = upstreamResponse.headers.get('content-type');
  const isMultipartRange = upstreamResponse.status === 206
    && contentType?.split(';')[0].trim().toLowerCase() === 'multipart/byteranges';
  responseHeaders.set('Content-Type',
    contentType && (contentType.startsWith('video/') || isMultipartRange) ? contentType : 'video/mp4');
  responseHeaders.set('Content-Disposition', 'inline');
  const acceptRanges = upstreamResponse.headers.get('accept-ranges');
  if (acceptRanges) responseHeaders.set('Accept-Ranges', acceptRanges);
  responseHeaders.set('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');

  const contentRange = upstreamResponse.headers.get('content-range');
  if (contentRange) responseHeaders.set('Content-Range', contentRange);

  const contentLength = upstreamResponse.headers.get('content-length');
  if (contentLength) responseHeaders.set('Content-Length', contentLength);

  return new NextResponse(request.method === 'HEAD' ? null : upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

export const HEAD = GET;
