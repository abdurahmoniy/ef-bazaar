import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ApiException, apiFetch } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { needsTermsConsent } from '@/lib/legal';
import { resolveOptionalUser } from '@/lib/optional-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Kirgan foydalanuvchidan joriy hujjatlarga rozilik so'rash kerakmi. Mehmon — yo'q. */
export async function GET() {
  const store = await cookies();
  const user = store.has('access_token') ? await resolveOptionalUser(getMe) : null;
  return NextResponse.json({ required: user !== null && needsTermsConsent(user) }, { headers: NO_STORE });
}

/** Rozilikni auth-service'ga yozadi; versiyani backend tekshiradi. */
export async function POST(request: Request) {
  let version: unknown;
  try {
    ({ version } = await request.json());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers: NO_STORE });
  }
  try {
    await apiFetch('/auth/v1/users/me/terms', { method: 'POST', body: { version } });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    const status = e instanceof ApiException ? e.status : 502;
    return NextResponse.json({ ok: false }, { status, headers: NO_STORE });
  }
}
