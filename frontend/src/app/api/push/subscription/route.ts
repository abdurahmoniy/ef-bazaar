import { NextRequest, NextResponse } from 'next/server';
import { getMe } from '@/lib/auth';
import { savePushSubscription, removePushSubscription } from '@/lib/push-server';
export const dynamic = 'force-dynamic';

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  // Use the browser-visible Host; Next.js may see an internal Docker origin.
  try { return Boolean(origin && new URL(origin).host === request.headers.get('host')); }
  catch { return false; }
}

export async function PUT(request: NextRequest) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  const user = await getMe();
  if (!user) return new NextResponse(null, { status: 401 });
  const body = await request.json().catch(() => null);
  if (body?.userId !== user.id) return new NextResponse(null, { status: 409 });
  if (typeof body?.token !== 'string' || !body.token.trim() || body.token.length > 2048) return new NextResponse(null, { status: 400 });
  try {
    await savePushSubscription(body.token);
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: 'Registration failed' }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  try {
    await removePushSubscription();
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: 'Unregistration failed' }, { status: 503 });
  }
}
