import { NextResponse } from 'next/server';
import { getMe } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { getPushConfig } from '@/lib/push-config';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { config, vapidKey } = getPushConfig();
  if (!config) return NextResponse.json({ config: null, vapidKey: '', userId: null }, { headers: { 'Cache-Control': 'no-store' } });
  try {
    const user = await getMe();
    const status = user ? await apiFetch<{ enabled: boolean }>('/marketplace/v1/notifications/push-status') : { enabled: false };
    return NextResponse.json({ config: status.enabled ? config : null, vapidKey, userId: user?.id ?? null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Push unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
