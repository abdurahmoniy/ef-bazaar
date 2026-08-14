/**
 * Builds the Cookie header for a request whose session was just refreshed.
 *
 * Split out of proxy.ts so it can be tested without a NextRequest: the logic
 * is a string join, but getting it wrong sends the upstream two access_token
 * entries and lets it pick the expired one.
 */

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

export function rewriteCookieHeader(
  existing: ReadonlyArray<{ name: string; value: string }>,
  tokens: { accessToken: string; refreshToken: string },
): string {
  const kept = existing
    .filter((c) => c.name !== ACCESS_COOKIE && c.name !== REFRESH_COOKIE)
    .map((c) => `${c.name}=${c.value}`);

  return [
    ...kept,
    `${ACCESS_COOKIE}=${tokens.accessToken}`,
    `${REFRESH_COOKIE}=${tokens.refreshToken}`,
  ].join('; ');
}
