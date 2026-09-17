import { cookies } from 'next/headers';
import { apiFetch } from './api';
const COOKIE = 'push_token';
const ENDPOINT = '/marketplace/v1/notifications/push-tokens';

export async function savePushSubscription(token: string) {
  const jar = await cookies();
  const previous = jar.get(COOKIE)?.value;
  await apiFetch(ENDPOINT, { method: 'PUT', body: { token }, signal: AbortSignal.timeout(10_000) });
  jar.set(COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365,
  });
  if (previous && previous !== token) {
    await apiFetch(ENDPOINT, { method: 'DELETE', body: { token: previous }, signal: AbortSignal.timeout(5_000) }).catch(() => undefined);
  }
}

export async function removePushSubscription() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await apiFetch(ENDPOINT, { method: 'DELETE', body: { token }, signal: AbortSignal.timeout(5_000) });
  jar.delete(COOKIE);
}
