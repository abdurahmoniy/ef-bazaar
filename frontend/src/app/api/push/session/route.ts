import { NextResponse } from 'next/server';
import { getMe } from '@/lib/auth';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getMe();
    return NextResponse.json({ userId: user?.id ?? null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ userId: null }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
