import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Lightweight session probe for client components on static pages (landing).
 * Reports only the PRESENCE of the httpOnly access-token cookie — no upstream
 * validation. Good enough to decide "Kirish" vs "Profil" in nav chrome: an
 * expired cookie just means /profile will bounce through login.
 */
export async function GET() {
  const store = await cookies();
  return NextResponse.json(
    { authenticated: store.has('access_token') },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
