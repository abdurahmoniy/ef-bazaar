/**
 * Links back to the marketplace app. The mail app has no login UI of its own —
 * auth cookies are set by efbazaar.uz with `Domain=efbazaar.uz`, so they're
 * shared across subdomains. When a visitor lands here without a session we
 * bounce them to the main site's login and come back via the main site's
 * `/mail/:path*` → `mail.efbazaar.uz/:path*` redirect.
 */

export const MAIN_SITE_URL = (process.env.NEXT_PUBLIC_MAIN_SITE_URL || 'https://efbazaar.uz')
  .replace(/\/+$/, '');

/**
 * @param localPath path on THIS app (e.g. `/`, `/<mailboxId>`)
 * @returns absolute main-site login URL whose `from` round-trips back here
 */
export function mainSiteLoginUrl(localPath: string): string {
  const suffix = localPath === '/' ? '' : localPath;
  return `${MAIN_SITE_URL}/auth/login?from=${encodeURIComponent(`/mail${suffix}`)}`;
}
