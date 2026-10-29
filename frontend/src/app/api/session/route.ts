import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { getMe } from '@/lib/auth';
import { resolveOptionalUser } from '@/lib/optional-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public session probe for static pages. Use the same verified user and
 * anonymous fallback as the marketplace; cookie presence alone is insufficient.
 */
export async function GET() {
  const store = await cookies();
  const user = store.has('access_token') ? await resolveOptionalUser(getMe) : null;
  return NextResponse.json(
    { authenticated: user !== null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
